```javascript
const MAX_AI_CHATS = 250;

// Change this to the cooldown you want.
// 3 days = 3 * 24 * 60 * 60 * 1000
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

// Temporary server-side usage storage.
// For permanent per-user limits, move this to Supabase.
const usage = new Map();

export default async function handler(req, res) {
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

      If your frontend later sends a real Supabase user ID,
      use that instead of the IP address.
    */
    const userId =
      req.headers["x-user-id"] ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      "unknown-user";

    let userUsage = usage.get(userId);

    if (!userUsage) {
      userUsage = {
        count: 0,
        cooldownUntil: null
      };

      usage.set(userId, userUsage);
    }

    /*
      Check whether the user is currently in cooldown.
    */
    if (
      userUsage.cooldownUntil &&
      Date.now() < userUsage.cooldownUntil
    ) {
      const remaining =
        userUsage.cooldownUntil - Date.now();

      const remainingDays =
        Math.ceil(
          remaining /
          (24 * 60 * 60 * 1000)
        );

      return res.status(429).json({
        error:
          `You've used your 250 AI chats. ` +
          `Your chats will return in about ${remainingDays} day(s).`,
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
      userUsage.cooldownUntil &&
      Date.now() >= userUsage.cooldownUntil
    ) {
      userUsage.count = 0;
      userUsage.cooldownUntil = null;
    }

    /*
      Check the 250-chat limit BEFORE calling OpenAI.
    */
    if (userUsage.count >= MAX_AI_CHATS) {
      userUsage.cooldownUntil =
        Date.now() + COOLDOWN_MS;

      return res.status(429).json({
        error:
          "You've reached your 250 AI chat limit. " +
          "Your chats will return after the cooldown.",
        limitReached: true,
        chatsUsed: MAX_AI_CHATS,
        chatsRemaining: 0,
        cooldown: true
      });
    }

    /*
      Count this AI message.

      This means:
      1st message = 1
      2nd message = 2
      ...
      250th message = 250
    */
    userUsage.count += 1;

    const chatsRemaining =
      MAX_AI_CHATS - userUsage.count;

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
Use funny emojis when something is funny 😂.
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
- Give more detail when the question needs it.
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
Use advanced explanations, proper terminology and deeper reasoning.

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
- Show the important steps.
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
- Do not pretend to see a chess position unless the position is provided.

CURRENT INFORMATION
Use web search when current or specific information is needed.

Use web search for:
- Current news
- Recent events
- Current sports
- Recent matches
- Current players
- Current teams
- Current records
- Famous people
- Athletes
- Footballers
- Basketball players
- Chess players
- Celebrities
- Politicians
- Recent discoveries
- Current technology
- Specific people
- Anything that may have changed recently

If you do not know who a specific person is, search for them.
Never invent a person or pretend to know something you do not know.

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

Do not pretend to know something when you are unsure.
Use web search when appropriate.
Never make up facts.
`;

    /*
      Only send the most recent 10 messages.
      This reduces unnecessary token usage while
      keeping enough context for normal conversation.
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

    const data = await response.json();

    /*
      If OpenAI itself is temporarily rate-limited,
      do NOT expose the ugly technical error to students.
    */
    if (!response.ok) {
      console.error("OPENAI ERROR:", data);

      if (response.status === 429) {
        return res.status(503).json({
          error:
            "LearnAI is busy right now. Please try again in a little while.",
          temporary: true,
          chatsUsed: userUsage.count,
          chatsRemaining: chatsRemaining
        });
      }

      return res.status(response.status).json({
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
      console.error(
        "OPENAI RESPONSE:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({
        error: "The AI returned no text."
      });
    }

    return res.status(200).json({
      answer: answer.trim(),

      // Useful for showing the student their remaining chats.
      chatsUsed: userUsage.count,
      chatsRemaining: chatsRemaining,
      limit: MAX_AI_CHATS
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error:
        "LearnAI had a problem. Please try again."
    });
  }
}
```
