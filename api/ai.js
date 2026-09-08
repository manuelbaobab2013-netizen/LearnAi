const MAX_AI_CHATS = 250;
const COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const userId =
      typeof body.userId === "string"
        ? body.userId.trim()
        : "";

    if (!userId) {
      return res.status(400).json({
        error: "User ID is required"
      });
    }

    const subject =
      typeof body.subject === "string"
        ? body.subject
        : "General";

    const level =
      typeof body.level === "string"
        ? body.level
        : "Grade 6";

    const language =
      typeof body.language === "string"
        ? body.language
        : "English";

    const history =
      Array.isArray(body.history)
        ? body.history
        : [];

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const openaiKey =
      process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !openaiKey) {
      return res.status(500).json({
        error:
          "Server environment variables are missing."
      });
    }

    const now = Date.now();

    /*
     * ------------------------------------------------
     * AI CHAT LIMIT
     * 250 messages
     * Then 2-day cooldown
     * Then automatic reset
     * ------------------------------------------------
     */

    const usageResponse = await fetch(
      supabaseUrl +
        "/rest/v1/ai_usage?user_id=eq." +
        encodeURIComponent(userId) +
        "&select=*",
      {
        headers: {
          apikey: supabaseKey,
          Authorization:
            "Bearer " + supabaseKey
        }
      }
    );

    if (!usageResponse.ok) {
      throw new Error(
        "Could not read AI usage."
      );
    }

    let rows =
      await usageResponse.json();

    let usage =
      rows[0];

    if (!usage) {

      const createResponse =
        await fetch(
          supabaseUrl +
            "/rest/v1/ai_usage",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              apikey:
                supabaseKey,

              Authorization:
                "Bearer " +
                supabaseKey,

              Prefer:
                "return=representation"
            },

            body:
              JSON.stringify({
                user_id:
                  userId,

                chat_count:
                  0,

                cooldown_until:
                  null
              })
          }
        );

      if (!createResponse.ok) {
        throw new Error(
          "Could not create AI usage."
        );
      }

      rows =
        await createResponse.json();

      usage =
        rows[0];
    }

    /*
     * If currently inside cooldown
     */

    if (
      usage.cooldown_until &&
      new Date(
        usage.cooldown_until
      ).getTime() > now
    ) {

      const remaining =
        new Date(
          usage.cooldown_until
        ).getTime() - now;

      const hours =
        Math.ceil(
          remaining /
          (60 * 60 * 1000)
        );

      return res.status(429).json({
        error:
          "You have used your 250 AI chats. Your chats reset in about " +
          hours +
          " hours.",

        chatsRemaining:
          0,

        cooldown: true
      });
    }

    /*
     * Cooldown finished
     * Reset counter
     */

    if (
      usage.cooldown_until &&
      new Date(
        usage.cooldown_until
      ).getTime() <= now
    ) {

      const resetResponse =
        await fetch(
          supabaseUrl +
            "/rest/v1/ai_usage?user_id=eq." +
            encodeURIComponent(userId),
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",

              apikey:
                supabaseKey,

              Authorization:
                "Bearer " +
                supabaseKey
            },

            body:
              JSON.stringify({
                chat_count:
                  0,

                cooldown_until:
                  null
              })
          }
        );

      if (!resetResponse.ok) {
        throw new Error(
          "Could not reset AI usage."
        );
      }

      usage.chat_count = 0;
      usage.cooldown_until = null;
    }

    /*
     * If already at 250,
     * start the 2-day cooldown.
     */

    if (
      Number(usage.chat_count || 0)
      >= MAX_AI_CHATS
    ) {

      const cooldownUntil =
        new Date(
          now + COOLDOWN_MS
        ).toISOString();

      await fetch(
        supabaseUrl +
          "/rest/v1/ai_usage?user_id=eq." +
          encodeURIComponent(userId),
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            apikey:
              supabaseKey,

            Authorization:
              "Bearer " +
              supabaseKey
          },

          body:
            JSON.stringify({
              cooldown_until:
                cooldownUntil
            })
        }
      );

      return res.status(429).json({
        error:
          "You have used your 250 AI chats. Please wait 2 days for your chats to reset.",

        chatsRemaining:
          0,

        cooldown: true
      });
    }

    /*
     * ------------------------------------------------
     * LEARNAI TUTOR INSTRUCTIONS
     * ------------------------------------------------
     */

    const instructions = `
You are LearnAI, a professional AI tutor.

Your job is to answer questions naturally,
clearly and intelligently.

You help students from Grade 1 through Grade 12.

PERSONALITY

- Be friendly and natural.
- Understand spelling mistakes and imperfect grammar.
- Understand short messages and slang.
- Focus on what the student means.
- Answer directly.
- Do not ask unnecessary questions.
- Do not repeat the student's question.
- If the student asks you to choose one, choose one.

EMOJIS

Use emojis naturally and occasionally.

Do not use emojis in every response.

Use funny emojis when something is funny 😂.

Use appropriate emojis for serious or difficult situations.

Do not overuse emojis.

WRITING STYLE

- Use clear normal punctuation.
- Do not overuse commas.
- Do not overuse exclamation marks.
- Do not use semicolons in normal answers.
- Use commas and full stops instead.
- Do not randomly use slashes.
- Do not use unnecessary symbols.
- Do not make every answer a long list.
- Use simple words when possible.
- Keep simple answers short.
- Give more detail when the question needs it.
- Make answers feel like a normal conversation.

STUDENT LEVEL

Current student level:
${level}

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

Current subject:
${subject}

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
And other school subjects.

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

If you do not know who a specific person is,
search for them.

Never invent a person or pretend to know something you do not know.

When web search gives you useful information,
explain it naturally.

IMPORTANT WEB RULE

Never show URLs, website links, citations,
source lists, reference links, markdown links
or website addresses to the student.

Do not write:

"Sources:"
"Click here..."
"[website.com](...)"

Use the information naturally.

Do not mention that you searched unless
it is useful to the conversation.

CONVERSATION

Use the previous conversation to understand context.

If the student says:

"just pick"
"pick one"
"choose one"

Make one clear choice.

If the question is clear,
answer it directly.

LANGUAGE

Answer in ${language},
unless the student clearly asks
for another language.

SAFETY

Keep responses appropriate for students.

Do not provide dangerous or illegal instructions.

IMPORTANT

Your goal is not only to answer.

Your goal is to help the student understand why.

Do not pretend to know something when unsure.

Use web search when appropriate.

Never make up facts.
`;

    /*
     * ------------------------------------------------
     * CONVERSATION HISTORY
     * ------------------------------------------------
     */

    const messages = [];

    for (
      const message of history.slice(-10)
    ) {

      if (
        !message ||
        !message.content
      ) {
        continue;
      }

      messages.push({
        role:
          message.role === "assistant"
            ? "assistant"
            : "user",

        content:
          String(message.content)
      });
    }

    /*
     * Always put the current question last.
     */

    messages.push({
      role: "user",
      content: question
    });

    /*
     * ------------------------------------------------
     * OPENAI
     * ------------------------------------------------
     */

    const openaiResponse =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              "Bearer " +
              openaiKey
          },

          body:
            JSON.stringify({
              model:
                "gpt-5.6-luna",

              instructions:
                instructions,

              input:
                messages,

              tools: [
                {
                  type:
                    "web_search"
                }
              ]
            })
        }
      );

    const data =
      await openaiResponse.json();

    /*
     * IMPORTANT:
     * Only count the chat if OpenAI
     * successfully answered.
     */

    if (!openaiResponse.ok) {

      console.error(
        "OPENAI ERROR:",
        data
      );

      return res.status(
        openaiResponse.status
      ).json({
        error:
          data?.error?.message ||
          "OpenAI request failed"
      });
    }

    let answer =
      data.output_text;

    if (
      !answer &&
      Array.isArray(data.output)
    ) {

      answer =
        data.output
          .filter(
            item =>
              item.type ===
              "message"
          )
          .flatMap(
            item =>
              item.content || []
          )
          .filter(
            item =>
              item.type ===
              "output_text"
          )
          .map(
            item =>
              item.text
          )
          .filter(Boolean)
          .join("\n");
    }

    if (!answer) {

      console.error(
        "OPENAI RESPONSE:",
        JSON.stringify(
          data,
          null,
          2
        )
      );

      return res.status(500).json({
        error:
          "The AI returned no text."
      });
    }

    /*
     * ------------------------------------------------
     * COUNT THIS SUCCESSFUL AI CHAT
     * ------------------------------------------------
     */

    const newCount =
      Number(
        usage.chat_count || 0
      ) + 1;

    let cooldownUntil = null;

    /*
     * When the 250th successful
     * conversation is used, record
     * the future cooldown time.
     *
     * The student still receives
     * the 250th answer.
     */

    if (
      newCount >= MAX_AI_CHATS
    ) {

      cooldownUntil =
        new Date(
          now + COOLDOWN_MS
        ).toISOString();
    }

    const updateResponse =
      await fetch(
        supabaseUrl +
          "/rest/v1/ai_usage?user_id=eq." +
          encodeURIComponent(userId),
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            apikey:
              supabaseKey,

            Authorization:
              "Bearer " +
              supabaseKey
          },

          body:
            JSON.stringify({
              chat_count:
                newCount,

              cooldown_until:
                cooldownUntil
            })
        }
      );

    if (!updateResponse.ok) {
      console.error(
        "Could not update AI usage."
      );
    }

    /*
     * ------------------------------------------------
     * SEND ANSWER BACK TO LEARNAI
     * ------------------------------------------------
     */

    return res.status(200).json({

      answer:
        answer.trim(),

      chatsRemaining:
        Math.max(
          0,
          MAX_AI_CHATS -
            newCount
        ),

      cooldown:
        newCount >= MAX_AI_CHATS
    });

  } catch (error) {

    console.error(
      "SERVER ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Server error"
    });
  }
};
