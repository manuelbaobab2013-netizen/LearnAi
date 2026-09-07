```javascript
const MAX_AI_CHATS = 250;
const COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

// Temporary per-server storage.
// We will move this to Supabase later for permanent accounts.
const usage = new Map();

export default async function handler(req, res) {
  // Always return JSON
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      question,
      subject = "General",
      level = "Grade 6",
      language = "English",
      history = []
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    /*
      Identify the user.

      Later we can replace this with the
      Supabase logged-in user's ID.
    */
    const userId =
      req.headers["x-user-id"] ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      "default-user";

    let user = usage.get(userId);

    if (!user) {
      user = {
        chatsUsed: 0,
        cooldownUntil: 0
      };

      usage.set(userId, user);
    }

    /*
      If the 2-day cooldown is active,
      don't send anything to OpenAI.
    */
    if (
      user.cooldownUntil &&
      Date.now() < user.cooldownUntil
    ) {
      const remaining =
        user.cooldownUntil - Date.now();

      const hoursLeft = Math.ceil(
        remaining / (60 * 60 * 1000)
      );

      return res.status(429).json({
        error:
          "You have used your 250 free AI chats. " +
          "Your 250 chats will return in about " +
          hoursLeft +
          " hour(s).",
        limitReached: true,
        chatsUsed: MAX_AI_CHATS,
        chatsRemaining: 0,
        cooldown: true
      });
    }

    /*
      Cooldown finished.
      Give the user another 250 chats.
    */
    if (
      user.cooldownUntil &&
      Date.now() >= user.cooldownUntil
    ) {
      user.chatsUsed = 0;
      user.cooldownUntil = 0;
    }

    /*
      250 chats reached.
    */
    if (user.chatsUsed >= MAX_AI_CHATS) {
      user.cooldownUntil =
        Date.now() + COOLDOWN_MS;

      return res.status(429).json({
        error:
          "You have used your 250 free AI chats. " +
          "Your chats will return after 2 days.",
        limitReached: true,
        chatsUsed: MAX_AI_CHATS,
        chatsRemaining: 0,
        cooldown: true
      });
    }

    const instructions = `
You are LearnAI, a professional AI tutor.

Your job is to answer questions naturally, clearly and intelligently.
You help students from Grade 1 through Grade 12.

PERSONALITY
- Be friendly and natural.
- Understand spelling mistakes and imperfect grammar.
- Understand short messages and slang.
- Focus on what the student means.
- Answer directly.
- Do not ask unnecessary questions.
- If the student asks you to choose one, choose one.
- Do not repeat the student's question.

EMOJIS
Use emojis naturally and occasionally.
Do not use emojis in every response.
Do not overuse emojis.

WRITING STYLE
- Use clear normal punctuation.
- Do not overuse commas.
- Do not overuse exclamation marks.
- Do not use semicolons in normal answers.
- Do not randomly use slashes.
- Do not make every answer a long list.
- Use simple words when possible.
- Keep simple answers short.
- Give more detail when needed.
- Make answers feel like a normal conversation.

STUDENT LEVEL
Current student level: ${level}

Adapt your explanation to the student's level.

Grade 1-3:
Use very simple words and easy examples.

Grade 4-6:
Use clear school-level explanations and examples.

Grade 7-9:
Use more detailed explanations and correct subject vocabulary.

Grade 10-12:
Use advanced explanations and proper terminology.

SUBJECT
Current subject: ${subject}

You can teach:
Mathematics
Science
English
History
Geography
Computer Science
Technology
Chess
Football
Basketball
General knowledge
And other subjects.

TEACHING
When the student asks you to teach something:
1. Explain the idea.
2. Explain why it works.
3. Give an example.
4. Give steps when useful.
5. Give practice questions when requested.

For mathematics:
- Show important steps.
- Explain the method.
- Give the final answer clearly.

For science:
- Explain what happens.
- Explain why it happens.
- Give an everyday example when useful.

For English:
- Explain grammar and vocabulary clearly.
- Give examples.

For chess:
- Explain ideas, tactics and strategy clearly.
- Do not pretend to see a chess position unless it is provided.

CURRENT INFORMATION
Use web search when current or specific information is needed.

Never invent facts or pretend to know something you do not know.

IMPORTANT WEB RULE
Never show URLs, website links, citations, source lists,
reference links, markdown links or website addresses to the student.

CONVERSATION
Use the previous conversation to understand context.

If the student says:
"just pick"
"pick one"
"choose one"

Make one clear choice.

If the question is clear, answer it directly.

LANGUAGE
Answer in ${language}, unless the student clearly asks for another language.

SAFETY
Keep responses appropriate for students.
Do not provide dangerous or illegal instructions.

IMPORTANT
Your goal is not only to answer.
Your goal is to help the student understand why.

Never make up facts.
`;

    /*
      Keep enough conversation context without
      sending the entire conversation every time.
    */
    const messages = [];

    if (Array.isArray(history)) {
      for (const message of history.slice(-10)) {
        if (!message || !message.content) continue;

        messages.push({
          role:
            message.role === "assistant"
              ? "assistant"
              : "user",
          content: String(message.content)
        });
      }
    }

    messages.push({
      role: "user",
      content: question
    });

    /*
      Ask OpenAI.
    */
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${process.env.OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",
          instructions,
          input: messages,

          tools: [
            {
              type: "web_search"
            }
          ]
        })
      }
    );

    /*
      Safely read the OpenAI response.
    */
    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      console.error(
        "OPENAI NON-JSON RESPONSE:",
        responseText
      );

      return res.status(503).json({
        error:
          "LearnAI is temporarily unavailable. Please try again."
      });
    }

    /*
      OpenAI error.
      IMPORTANT:
      This does NOT consume one of the 250 chats.
    */
    if (!response.ok) {
      console.error("OPENAI ERROR:", data);

      if (response.status === 429) {
        return res.status(503).json({
          error:
            "LearnAI is busy right now. Please try again shortly.",
          temporary: true
        });
      }

      return res.status(503).json({
        error:
          "LearnAI could not answer right now. Please try again."
      });
    }

    let answer = data.output_text;

    if (!answer && Array.isArray(data.output)) {
      answer = data.output
        .filter(item => item.type === "message")
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .filter(Boolean)
        .join("\n");
    }

    if (!answer) {
      return res.status(503).json({
        error:
          "LearnAI did not return an answer. Please try again."
      });
    }

    /*
      ONLY count the chat after OpenAI successfully
      returned an answer.
    */
    user.chatsUsed += 1;

    /*
      If this was the 250th successful chat,
      start the 2-day cooldown.
    */
    if (user.chatsUsed >= MAX_AI_CHATS) {
      user.cooldownUntil =
        Date.now() + COOLDOWN_MS;
    }

    return res.status(200).json({
      answer: answer.trim(),

      chatsUsed: user.chatsUsed,

      chatsRemaining:
        MAX_AI_CHATS - user.chatsUsed,

      limit: MAX_AI_CHATS,

      cooldown:
        user.chatsUsed >= MAX_AI_CHATS
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error:
        "LearnAI had a server problem. Please try again."
    });
  }
}
```
