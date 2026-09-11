import { createClient } from "@supabase/supabase-js";

const MAX_AI_CHATS = 250;
const COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      question,
      subject,
      level,
      language
    } = req.body || {};

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    // -----------------------------------------
    // ENVIRONMENT VARIABLES
    // -----------------------------------------

    const supabaseUrl = process.env.SUPABASE_URL;

    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;

    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const openaiKey =
      process.env.OPENAI_API_KEY;

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseServiceKey
    ) {
      console.error(
        "Supabase environment variables are missing."
      );

      return res.status(500).json({
        error:
          "Supabase is not connected to this Vercel deployment."
      });
    }

    if (!openaiKey) {
      console.error(
        "OPENAI_API_KEY is not available."
      );

      return res.status(500).json({
        error:
          "OpenAI API key is not connected to this Vercel deployment."
      });
    }

    // -----------------------------------------
    // GET USER FROM LOGIN SESSION
    // -----------------------------------------

    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Please log in again."
      });
    }

    const accessToken =
      authorization.replace("Bearer ", "").trim();

    // Client using the user's access token
    const userClient = createClient(
      supabaseUrl,
      supabaseAnonKey
    );

    const {
      data: userData,
      error: userError
    } =
      await userClient.auth.getUser(
        accessToken
      );

    if (
      userError ||
      !userData?.user
    ) {
      console.error(
        "Supabase authentication error:",
        userError
      );

      return res.status(401).json({
        error:
          "Your login session is invalid or expired."
      });
    }

    const userId =
      userData.user.id;

    // -----------------------------------------
    // SERVER-SIDE SUPABASE CLIENT
    // -----------------------------------------

    const adminClient =
      createClient(
        supabaseUrl,
        supabaseServiceKey
      );

    // -----------------------------------------
    // GET OR CREATE USER USAGE
    // -----------------------------------------

    let {
      data: usage,
      error: usageError
    } =
      await adminClient
        .from("ai_usage")
        .select(
          "user_id, used, cooldown_until"
        )
        .eq("user_id", userId)
        .maybeSingle();

    if (usageError) {
      console.error(
        "Could not read AI usage:",
        usageError
      );

      return res.status(500).json({
        error:
          "Could not read your AI usage."
      });
    }

    if (!usage) {
      const {
        data: newUsage,
        error: createError
      } =
        await adminClient
          .from("ai_usage")
          .insert({
            user_id: userId,
            used: 0,
            cooldown_until: null
          })
          .select(
            "user_id, used, cooldown_until"
          )
          .single();

      if (createError) {
        console.error(
          "Could not create AI usage:",
          createError
        );

        return res.status(500).json({
          error:
            "Could not create your AI usage record."
        });
      }

      usage = newUsage;
    }

    // -----------------------------------------
    // CHECK EXISTING COOLDOWN
    // -----------------------------------------

    const now = Date.now();

    if (usage.cooldown_until) {
      const cooldownTime =
        new Date(
          usage.cooldown_until
        ).getTime();

      if (cooldownTime > now) {
        const remainingMs =
          cooldownTime - now;

        const remainingHours =
          Math.ceil(
            remainingMs /
              (60 * 60 * 1000)
          );

        return res.status(429).json({
          error:
            `Your 250-turn AI limit has been reached. ` +
            `Please wait about ${remainingHours} hour(s).`,
          cooldown: true,
          cooldownUntil:
            usage.cooldown_until,
          turnsUsed: 250,
          turnsRemaining: 0
        });
      }

      // -----------------------------------------
      // COOLDOWN FINISHED — RESET
      // -----------------------------------------

      const {
        data: resetUsage,
        error: resetError
      } =
        await adminClient
          .from("ai_usage")
          .update({
            used: 0,
            cooldown_until: null
          })
          .eq("user_id", userId)
          .select(
            "user_id, used, cooldown_until"
          )
          .single();

      if (resetError) {
        console.error(
          "Could not reset AI usage:",
          resetError
        );

        return res.status(500).json({
          error:
            "Could not reset your AI usage."
        });
      }

      usage = resetUsage;
    }

    // -----------------------------------------
    // CHECK 250-TURN LIMIT
    // -----------------------------------------

    const currentCount =
      Number(usage.used || 0);

    if (
      currentCount >=
      MAX_AI_CHATS
    ) {
      const cooldownUntil =
        new Date(
          Date.now() +
            COOLDOWN_MS
        ).toISOString();

      await adminClient
        .from("ai_usage")
        .update({
          cooldown_until:
            cooldownUntil
        })
        .eq("user_id", userId);

      return res.status(429).json({
        error:
          "Your 250-turn AI limit has been reached. A 2-day cooldown has started.",
        cooldown: true,
        cooldownUntil,
        turnsUsed: 250,
        turnsRemaining: 0
      });
    }

    // -----------------------------------------
    // LEARNAI TUTOR INSTRUCTIONS
    // -----------------------------------------

    const instructions = `
You are LearnAI, an AI tutor.

Be friendly, patient, safe, and educational.

Explain things clearly and step by step.
Match the student's learning level.
Use simple explanations when appropriate.
Do not make up facts.
If the student asks for school work, help them understand it.

Subject: ${subject || "General"}
Learning level: ${level || "Beginner"}
Language: ${language || "English"}
`;

    // -----------------------------------------
    // OPENAI REQUEST
    // -----------------------------------------

    const response =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${openaiKey}`
          },

          body: JSON.stringify({
            model: "gpt-5.6-luna",

            instructions,

            input: question,

            max_output_tokens: 300
          })
        }
      );

    const data =
      await response.json();

    console.log(
      "OpenAI status:",
      response.status
    );

    // -----------------------------------------
    // OPENAI ERROR
    // -----------------------------------------

    if (!response.ok) {
      console.error(
        "OpenAI error:",
        data
      );

      return res.status(
        response.status
      ).json({
        error:
          data?.error?.message ||
          "OpenAI request failed."
      });
    }

    // -----------------------------------------
    // GET OPENAI ANSWER
    // -----------------------------------------

    let answer =
      data?.output_text;

    if (
      !answer &&
      Array.isArray(
        data?.output
      )
    ) {
      answer =
        data.output
          .flatMap(
            item =>
              Array.isArray(
                item.content
              )
                ? item.content
                : []
          )
          .filter(
            item =>
              item.type ===
              "output_text"
          )
          .map(
            item =>
              item.text || ""
          )
          .join("");
    }

    if (!answer) {
      return res.status(500).json({
        error:
          "OpenAI returned no answer."
      });
    }

    // -----------------------------------------
    // COUNT ONLY SUCCESSFUL AI TURNS
    // -----------------------------------------

    const newCount =
      currentCount + 1;

    let cooldownUntil = null;

    // The 250th successful message
    // starts the 2-day cooldown.
    if (
      newCount >=
      MAX_AI_CHATS
    ) {
      cooldownUntil =
        new Date(
          Date.now() +
            COOLDOWN_MS
        ).toISOString();
    }

    const {
      error: updateError
    } =
      await adminClient
        .from("ai_usage")
        .update({
          used: newCount,
          cooldown_until:
            cooldownUntil
        })
        .eq("user_id", userId);

    if (updateError) {
      console.error(
        "Could not update AI usage:",
        updateError
      );
    }

    // -----------------------------------------
    // SEND ANSWER TO LEARNAI
    // -----------------------------------------

    return res.status(200).json({
      answer,

      turnsUsed:
        newCount,

      turnsRemaining:
        Math.max(
          0,
          MAX_AI_CHATS -
            newCount
        ),

      cooldown:
        newCount >=
        MAX_AI_CHATS,

      cooldownUntil
    });

  } catch (error) {
    console.error(
      "SERVER ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Server error."
    });
  }
}
