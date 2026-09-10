const { createClient } = require("@supabase/supabase-js");

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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;

    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl) {
      return res.status(500).json({
        error: "SUPABASE_URL is missing in Vercel."
      });
    }

    if (!supabaseServiceKey) {
      return res.status(500).json({
        error: "SUPABASE_SERVICE_ROLE_KEY is missing in Vercel."
      });
    }

    if (!supabaseAnonKey) {
      return res.status(500).json({
        error:
          "SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is missing in Vercel."
      });
    }

    if (!openaiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing in Vercel."
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
        error: "You must be logged in to use LearnAI."
      });
    }

    const accessToken =
      authHeader.slice(7).trim();

    if (!accessToken) {
      return res.status(401).json({
        error: "Your login session is missing."
      });
    }

    /*
     * IMPORTANT:
     * Verify the access token using the Supabase client.
     * The service-role client is NOT used to authenticate
     * the student's token.
     */

    const supabaseAuth = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    const {
      data: authData,
      error: authError
    } = await supabaseAuth.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      console.error(
        "SUPABASE TOKEN ERROR:",
        authError?.message || "No user returned"
      );

      return res.status(401).json({
        error:
          "Your login session is invalid or expired. Please log out and log in again."
      });
    }

    const userId = authData.user.id;

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

    const grade =
      typeof body.grade === "string" &&
      body.grade.trim()
        ? body.grade.trim()
        : level;

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
       SUPABASE REST BASE
    ----------------------------------------- */

    const baseUrl =
      supabaseUrl.replace(/\/$/, "");

    const serviceHeaders = {
      apikey: supabaseServiceKey,
      Authorization:
        "Bearer " + supabaseServiceKey
    };

    /* -----------------------------------------
       AI USAGE
    ----------------------------------------- */

    const usageUrl =
      baseUrl +
      "/rest/v1/ai_usage?user_id=eq." +
      encodeURIComponent(userId) +
      "&select=*";

    const usageResponse =
      await fetch(usageUrl, {
        method: "GET",
        headers: serviceHeaders
      });

    if (!usageResponse.ok) {
      console.error(
        "AI USAGE READ ERROR:",
        await usageResponse.text()
      );

      return res.status(500).json({
        error:
          "Could not read your LearnAI usage."
      });
    }

    let rows =
      await usageResponse.json();

    let usage = rows[0];

    /* -----------------------------------------
       CREATE USAGE RECORD
    ----------------------------------------- */

    if (!usage) {
      const createResponse =
        await fetch(
          baseUrl + "/rest/v1/ai_usage",
          {
            method: "POST",

            headers: {
              ...serviceHeaders,
              "Content-Type":
                "application/json",
              Prefer:
                "return=representation"
            },

            body: JSON.stringify({
              user_id: userId,
              chat_count: 0,
              cooldown_until: null
            })
          }
        );

      if (!createResponse.ok) {
        console.error(
          "AI USAGE CREATE ERROR:",
          await createResponse.text()
        );

        return res.status(500).json({
          error:
            "Could not create your AI usage record."
        });
      }

      rows =
        await createResponse.json();

      usage = rows[0];
    }

    const now = Date.now();

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

      /* Reset after cooldown */

      const resetResponse =
        await fetch(
          baseUrl +
            "/rest/v1/ai_usage?user_id=eq." +
            encodeURIComponent(userId),
          {
            method: "PATCH",

            headers: {
              ...serviceHeaders,
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              chat_count: 0,
              cooldown_until: null
            })
          }
        );

      if (!resetResponse.ok) {
        console.error(
          "AI USAGE RESET ERROR:",
          await resetResponse.text()
        );

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
      Number(usage.chat_count || 0);

    if (currentCount >= MAX_AI_CHATS) {
      const cooldownUntil =
        new Date(
          now + COOLDOWN_MS
        ).toISOString();

      await fetch(
        baseUrl +
          "/rest/v1/ai_usage?user_id=eq." +
          encodeURIComponent(userId),
        {
          method: "PATCH",

          headers: {
            ...serviceHeaders,
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
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

STUDENT GRADE:
${grade}

STUDENT LEVEL:
${level}

SUBJECT:
${subject}

LANGUAGE:
${language}

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

Never invent facts.

STYLE:
- Keep simple answers short.
- Give more detail when necessary.
- Use normal punctuation.
- Do not overuse emojis.
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

    for (const message of history.slice(-10)) {
      if (
        !message ||
        typeof message.content !== "string" ||
        !message.content.trim()
      ) {
        continue;
      }

      messages.push({
        role:
          message.role === "assistant"
            ? "assistant"
            : "user",

        content:
          message.content
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
            "Content-Type": "application/json",

            Authorization:
              "Bearer " + openaiKey
          },

          body: JSON.stringify({
            model: "gpt-5.6-luna",

            instructions: instructions,

            input: messages.slice(-4),

            max_output_tokens: 1000,

            tools: [
              {
                type: "web_search"
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
      Array.isArray(data.output)
    ) {
      answer =
        data.output
          .filter(
            item =>
              item.type === "message"
          )
          .flatMap(
            item =>
              item.content || []
          )
          .filter(
            item =>
              item.type === "output_text"
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

    let cooldownUntil = null;

    if (newCount >= MAX_AI_CHATS) {
      cooldownUntil =
        new Date(
          now + COOLDOWN_MS
        ).toISOString();
    }

    const updateResponse =
      await fetch(
        baseUrl +
          "/rest/v1/ai_usage?user_id=eq." +
          encodeURIComponent(userId),
        {
          method: "PATCH",

          headers: {
            ...serviceHeaders,
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            chat_count: newCount,
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
      answer: answer.trim(),

      chatsRemaining:
        Math.max(
          0,
          MAX_AI_CHATS - newCount
        ),

      cooldown:
        newCount >= MAX_AI_CHATS
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
