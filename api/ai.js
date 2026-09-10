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

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      supabaseServiceKey;

    const openaiKey =
      process.env.OPENAI_API_KEY;

    /* -----------------------------------------
       ENVIRONMENT CHECK
    ----------------------------------------- */

    if (!supabaseUrl) {
      return res.status(500).json({
        error: "SUPABASE_URL is missing in Vercel."
      });
    }

    if (!supabaseServiceKey) {
      return res.status(500).json({
        error:
          "SUPABASE_SERVICE_ROLE_KEY is missing in Vercel."
      });
    }

    if (!openaiKey) {
      return res.status(500).json({
        error:
          "OPENAI_API_KEY is missing in Vercel."
      });
    }

    /* -----------------------------------------
       QUESTION
    ----------------------------------------- */

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return res.status(400).json({
        error: "Question is required."
      });
    }

    /* -----------------------------------------
       AUTHENTICATION
    ----------------------------------------- */

    const authHeader =
      req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error:
          "You must be logged in to use LearnAI."
      });
    }

    const accessToken =
      authHeader.substring(7).trim();

    if (!accessToken) {
      return res.status(401).json({
        error:
          "Your login session is missing."
      });
    }

    /*
     * Verify the student's Supabase session.
     *
     * IMPORTANT:
     * The user's access token goes in Authorization.
     * The Supabase project key goes in apikey.
     */

    const authResponse =
      await fetch(
        supabaseUrl.replace(/\/$/, "") +
          "/auth/v1/user",
        {
          method: "GET",

          headers: {
            apikey: supabaseAnonKey,
            Authorization:
              "Bearer " + accessToken
          }
        }
      );

    if (!authResponse.ok) {
      const authText =
        await authResponse.text();

      console.error(
        "SUPABASE AUTH ERROR:",
        authText
      );

      return res.status(401).json({
        error:
          "Your login session is invalid or expired. Please log out and log in again."
      });
    }

    const authUser =
      await authResponse.json();

    const userId =
      authUser?.id;

    if (!userId) {
      return res.status(401).json({
        error:
          "Could not verify your LearnAI account."
      });
    }

    /* -----------------------------------------
       STUDENT SETTINGS
    ----------------------------------------- */

    const subject =
      typeof body.subject === "string" &&
      body.subject.trim()
        ? body.subject.trim()
        : "General";

    const level =
      typeof body.level === "string" &&
      body.level.trim()
        ? body.level.trim()
        : "Grade 6";

    const language =
      typeof body.language === "string" &&
      body.language.trim()
        ? body.language.trim()
        : "English";

    const history =
      Array.isArray(body.history)
        ? body.history
        : [];

    /* -----------------------------------------
       AI USAGE
    ----------------------------------------- */

    const usageUrl =
      supabaseUrl.replace(/\/$/, "") +
      "/rest/v1/ai_usage?user_id=eq." +
      encodeURIComponent(userId) +
      "&select=*";

    const usageResponse =
      await fetch(usageUrl, {
        method: "GET",

        headers: {
          apikey: supabaseServiceKey,
          Authorization:
            "Bearer " +
            supabaseServiceKey
        }
      });

    if (!usageResponse.ok) {
      const text =
        await usageResponse.text();

      console.error(
        "AI USAGE READ ERROR:",
        text
      );

      return res.status(500).json({
        error:
          "Could not read your LearnAI usage."
      });
    }

    let rows =
      await usageResponse.json();

    let usage =
      rows[0];

    /* -----------------------------------------
       CREATE USAGE RECORD
    ----------------------------------------- */

    if (!usage) {
      const createResponse =
        await fetch(
          supabaseUrl.replace(/\/$/, "") +
            "/rest/v1/ai_usage",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              apikey:
                supabaseServiceKey,

              Authorization:
                "Bearer " +
                supabaseServiceKey,

              Prefer:
                "return=representation"
            },

            body:
              JSON.stringify({
                user_id: userId,
                chat_count: 0,
                cooldown_until: null
              })
          }
        );

      if (!createResponse.ok) {
        const text =
          await createResponse.text();

        console.error(
          "AI USAGE CREATE ERROR:",
          text
        );

        return res.status(500).json({
          error:
            "Could not create your AI usage record."
        });
      }

      rows =
        await createResponse.json();

      usage =
        rows[0];
    }

    const now =
      Date.now();

    /* -----------------------------------------
       COOLDOWN
    ----------------------------------------- */

    if (usage.cooldown_until) {
      const cooldownTime =
        new Date(
          usage.cooldown_until
        ).getTime();

      if (cooldownTime > now) {
        const remaining =
          cooldownTime - now;

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

          chatsRemaining: 0,

          cooldown: true
        });
      }

      /* ---------------------------------------
         COOLDOWN FINISHED
      --------------------------------------- */

      const resetResponse =
        await fetch(
          supabaseUrl.replace(/\/$/, "") +
            "/rest/v1/ai_usage?user_id=eq." +
            encodeURIComponent(userId),
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",

              apikey:
                supabaseServiceKey,

              Authorization:
                "Bearer " +
                supabaseServiceKey
            },

            body:
              JSON.stringify({
                chat_count: 0,
                cooldown_until: null
              })
          }
        );

      if (!resetResponse.ok) {
        return res.status(500).json({
          error:
            "Could not reset your AI chats."
        });
      }

      usage.chat_count = 0;
      usage.cooldown_until = null;
    }

    /* -----------------------------------------
       250 CHAT LIMIT
    ----------------------------------------- */

    const currentCount =
      Number(
        usage.chat_count || 0
      );

    if (
      currentCount >=
      MAX_AI_CHATS
    ) {
      const cooldownUntil =
        new Date(
          now + COOLDOWN_MS
        ).toISOString();

      await fetch(
        supabaseUrl.replace(/\/$/, "") +
          "/rest/v1/ai_usage?user_id=eq." +
          encodeURIComponent(userId),
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            apikey:
              supabaseServiceKey,

            Authorization:
              "Bearer " +
              supabaseServiceKey
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

        chatsRemaining: 0,

        cooldown: true
      });
    }

    /* -----------------------------------------
       LEARNAI INSTRUCTIONS
    ----------------------------------------- */

    const instructions = `
You are LearnAI, a professional AI tutor.

You help students from Grade 1 through Grade 12.

CURRENT STUDENT LEVEL:
${level}

CURRENT SUBJECT:
${subject}

CURRENT LANGUAGE:
${language}

LANGUAGE:
Answer in ${language}, unless the student clearly asks for another language.

PERSONALITY:
- Be friendly and natural.
- Understand spelling mistakes.
- Understand short messages and slang.
- Focus on what the student means.
- Answer directly.
- Do not ask unnecessary questions.
- Do not repeat the student's question.
- If the student asks you to choose one thing, choose one clearly.

TEACHING:
When teaching:
1. Explain the idea.
2. Explain why it works.
3. Give an example.
4. Give steps when useful.
5. Give practice questions when requested.

MATHEMATICS:
- Show important steps.
- Explain the method.
- Give the final answer clearly.

SCIENCE:
- Explain what happens.
- Explain why it happens.
- Give everyday examples when useful.

ENGLISH:
- Explain grammar and vocabulary clearly.
- Give examples.

CHESS:
- Explain tactics, strategy and ideas clearly.
- Never pretend to see a position that was not provided.

CURRENT INFORMATION:
Use web search when current information is needed.

This includes:
- current news
- recent events
- sports
- football
- basketball
- chess
- current players
- current teams
- current records
- technology
- famous people
- recent discoveries
- anything that may have changed recently

Never invent facts.

STYLE:
- Keep simple answers short.
- Give more detail when necessary.
- Use normal punctuation.
- Do not overuse emojis.
- Use emojis naturally when appropriate.
- Do not use unnecessary symbols.
- Do not make every answer a huge list.

SAFETY:
Keep responses appropriate for students.
Do not provide dangerous or illegal instructions.

IMPORTANT:
Your goal is to help the student understand, not just give an answer.
Never pretend to know something when you are unsure.
`;

    /* -----------------------------------------
       CONVERSATION HISTORY
    ----------------------------------------- */

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
          message.role ===
          "assistant"
            ? "assistant"
            : "user",

        content:
          String(
            message.content
          )
      });
    }

    messages.push({
      role: "user",
      content: question
    });

    /* -----------------------------------------
       OPENAI
    ----------------------------------------- */

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

    /* -----------------------------------------
       OPENAI ERROR
    ----------------------------------------- */

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
          "OpenAI request failed."
      });
    }

    /* -----------------------------------------
       GET ANSWER
    ----------------------------------------- */

    let answer =
      data.output_text;

    if (
      !answer &&
      Array.isArray(
        data.output
      )
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
        "EMPTY OPENAI RESPONSE:",
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

    /* -----------------------------------------
       COUNT SUCCESSFUL CHAT
    ----------------------------------------- */

    const newCount =
      currentCount + 1;

    let cooldownUntil =
      null;

    if (
      newCount >=
      MAX_AI_CHATS
    ) {
      cooldownUntil =
        new Date(
          now + COOLDOWN_MS
        ).toISOString();
    }

    const updateResponse =
      await fetch(
        supabaseUrl.replace(/\/$/, "") +
          "/rest/v1/ai_usage?user_id=eq." +
          encodeURIComponent(userId),
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            apikey:
              supabaseServiceKey,

            Authorization:
              "Bearer " +
              supabaseServiceKey
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
        "AI USAGE UPDATE FAILED:",
        await updateResponse.text()
      );
    }

    /* -----------------------------------------
       SUCCESS
    ----------------------------------------- */

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
        newCount >=
        MAX_AI_CHATS
    });

  } catch (error) {
    console.error(
      "LEARN AI SERVER ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "LearnAI server error."
    });
  }
};
