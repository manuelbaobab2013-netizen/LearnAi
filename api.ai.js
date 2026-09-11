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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseServiceKey
    ) {
      return res.status(500).json({
        error: "Supabase is not connected."
      });
    }

    if (!openaiKey && !geminiKey) {
      return res.status(500).json({
        error: "No AI provider is connected."
      });
    }

    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Please log in again."
      });
    }

    const accessToken =
      authorization.replace("Bearer ", "").trim();

    const userClient = createClient(
      supabaseUrl,
      supabaseAnonKey
    );

    const {
      data: userData,
      error: userError
    } = await userClient.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return res.status(401).json({
        error: "Your login session is invalid or expired."
      });
    }

    const userId = userData.user.id;

    const adminClient = createClient(
      supabaseUrl,
      supabaseServiceKey
    );

    let {
      data: usage,
      error: usageError
    } = await adminClient
      .from("ai_usage")
      .select("user_id, used, cooldown_until")
      .eq("user_id", userId)
      .maybeSingle();

    if (usageError) {
      console.error("AI usage error:", usageError);

      return res.status(500).json({
        error: "Could not read your AI usage."
      });
    }

    if (!usage) {
      const {
        data: newUsage,
        error: createError
      } = await adminClient
        .from("ai_usage")
        .insert({
          user_id: userId,
          used: 0,
          cooldown_until: null
        })
        .select("user_id, used, cooldown_until")
        .single();

      if (createError) {
        console.error("Usage creation error:", createError);

        return res.status(500).json({
          error: "Could not create your AI usage record."
        });
      }

      usage = newUsage;
    }

    const now = Date.now();

    if (usage.cooldown_until) {
      const cooldownTime =
        new Date(usage.cooldown_until).getTime();

      if (cooldownTime > now) {
        const remainingHours = Math.ceil(
          (cooldownTime - now) /
          (60 * 60 * 1000)
        );

        return res.status(429).json({
          error:
            `Your 250-turn AI limit has been reached. ` +
            `Please wait about ${remainingHours} hour(s).`,
          cooldown: true,
          cooldownUntil: usage.cooldown_until,
          turnsUsed: 250,
          turnsRemaining: 0
        });
      }

      const {
        data: resetUsage,
        error: resetError
      } = await adminClient
        .from("ai_usage")
        .update({
          used: 0,
          cooldown_until: null
        })
        .eq("user_id", userId)
        .select("user_id, used, cooldown_until")
        .single();

      if (resetError) {
        return res.status(500).json({
          error: "Could not reset your AI usage."
        });
      }

      usage = resetUsage;
    }

    const currentCount = Number(usage.used || 0);

    if (currentCount >= MAX_AI_CHATS) {
      const cooldownUntil =
        new Date(Date.now() + COOLDOWN_MS).toISOString();

      await adminClient
        .from("ai_usage")
        .update({
          cooldown_until: cooldownUntil
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

    const instructions = `
You are LearnAI, an AI tutor.

Be friendly, patient, safe, and educational.

Explain things clearly and step by step.
Match the student's learning level.
Use simple explanations when appropriate.
Do not make up facts.
Help the student understand their school work.

Subject: ${subject || "General"}
Learning level: ${level || "Beginner"}
Language: ${language || "English"}
`;

    let answer = null;
    let provider = null;

    // ==========================================
    // 1. TRY OPENAI FIRST
    // ==========================================

    if (openaiKey) {
      try {
        const openaiResponse = await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
              model: "gpt-5.6-luna",
              instructions,
              input: question,
              max_output_tokens: 300
            })
          }
        );

        const openaiData =
          await openaiResponse.json();

        console.log(
          "OpenAI status:",
          openaiResponse.status
        );

        if (openaiResponse.ok) {
          answer = openaiData?.output_text;

          if (
            !answer &&
            Array.isArray(openaiData?.output)
          ) {
            answer =
              openaiData.output
                .flatMap(item =>
                  Array.isArray(item.content)
                    ? item.content
                    : []
                )
                .filter(
                  item =>
                    item.type === "output_text"
                )
                .map(
                  item => item.text || ""
                )
                .join("");
          }

          if (answer) {
            provider = "OpenAI";
          }
        } else {
          console.error(
            "OpenAI failed. Trying Gemini backup."
          );
        }
      } catch (openaiError) {
        console.error(
          "OpenAI connection error:",
          openaiError
        );
      }
    }

    // ==========================================
    // 2. GEMINI BACKUP
    // ==========================================

    if (!answer && geminiKey) {
      try {
        const geminiPrompt = `
${instructions}

Student question:
${question}
`;

        const geminiResponse = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiKey
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: geminiPrompt
                    }
                  ]
                }
              ],
              generationConfig: {
                maxOutputTokens: 300
              }
            })
          }
        );

        const geminiData =
          await geminiResponse.json();

        console.log(
          "Gemini status:",
          geminiResponse.status
        );

        if (!geminiResponse.ok) {
          console.error(
            "Gemini error:",
            geminiData
          );
        } else {
          answer =
            geminiData?.candidates?.[0]?.content?.parts
              ?.map(part => part.text || "")
              .join("");

          if (answer) {
            provider = "Gemini";
          }
        }
      } catch (geminiError) {
        console.error(
          "Gemini connection error:",
          geminiError
        );
      }
    }

    // ==========================================
    // 3. BOTH FAILED
    // ==========================================

    if (!answer) {
      return res.status(503).json({
        error:
          "Both AI providers are temporarily unavailable."
      });
    }

    // ==========================================
    // 4. COUNT ONE SUCCESSFUL LEARN AI TURN
    // ==========================================

    const newCount = currentCount + 1;

    let cooldownUntil = null;

    if (newCount >= MAX_AI_CHATS) {
      cooldownUntil =
        new Date(
          Date.now() + COOLDOWN_MS
        ).toISOString();
    }

    const {
      error: updateError
    } = await adminClient
      .from("ai_usage")
      .update({
        used: newCount,
        cooldown_until: cooldownUntil
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error(
        "Could not update AI usage:",
        updateError
      );
    }

    return res.status(200).json({
      answer,
      provider,
      turnsUsed: newCount,
      turnsRemaining:
        Math.max(
          0,
          MAX_AI_CHATS - newCount
        ),
      cooldown:
        newCount >= MAX_AI_CHATS,
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
