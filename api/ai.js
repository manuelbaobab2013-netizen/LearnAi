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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey =
      process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !openaiKey) {
      return res.status(500).json({
        error: "Server environment variables are missing."
      });
    }

    const now = Date.now();

    const usageResponse = await fetch(
      supabaseUrl +
        "/rest/v1/ai_usage?user_id=eq." +
        encodeURIComponent(userId) +
        "&select=*",
      {
        headers: {
          apikey: supabaseKey,
          Authorization: "Bearer " + supabaseKey
        }
      }
    );

    if (!usageResponse.ok) {
      throw new Error("Could not read AI usage.");
    }

    let rows = await usageResponse.json();
    let usage = rows[0];

    if (!usage) {
      const createResponse = await fetch(
        supabaseUrl + "/rest/v1/ai_usage",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: "Bearer " + supabaseKey,
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            user_id: userId,
            chat_count: 0,
            cooldown_until: null
          })
        }
      );

      if (!createResponse.ok) {
        throw new Error("Could not create AI usage.");
      }

      rows = await createResponse.json();
      usage = rows[0];
    }

    if (
      usage.cooldown_until &&
      new Date(usage.cooldown_until).getTime() > now
    ) {
      const remaining =
        new Date(usage.cooldown_until).getTime() - now;

      const hours = Math.ceil(
        remaining / (60 * 60 * 1000)
      );

      return res.status(429).json({
        error:
          "You have used your 250 AI chats. Your chats reset in about " +
          hours +
          " hours."
      });
    }

    if (
      usage.cooldown_until &&
      new Date(usage.cooldown_until).getTime() <= now
    ) {
      await fetch(
        supabaseUrl +
          "/rest/v1/ai_usage?user_id=eq." +
          encodeURIComponent(userId),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: "Bearer " + supabaseKey
          },
          body: JSON.stringify({
            chat_count: 0,
            cooldown_until: null
          })
        }
      );

      usage.chat_count = 0;
      usage.cooldown_until = null;
    }

    if (usage.chat_count >= MAX_AI_CHATS) {
      const cooldownUntil =
        new Date(now + COOLDOWN_MS).toISOString();

      await fetch(
        supabaseUrl +
          "/rest/v1/ai_usage?user_id=eq." +
          encodeURIComponent(userId),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: "Bearer " + supabaseKey
          },
          body: JSON.stringify({
            cooldown_until: cooldownUntil
          })
        }
      );

      return res.status(429).json({
        error:
          "You have used your 250 AI chats. Please wait 2 days for your chats to reset."
      });
    }

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + openaiKey
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: question
        })
      }
    );

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error:
          data?.error?.message ||
          "OpenAI request failed"
      });
    }

    const answer =
      data.output_text ||
      "The AI returned no answer.";

    const newCount =
      Number(usage.chat_count || 0) + 1;

    await fetch(
      supabaseUrl +
        "/rest/v1/ai_usage?user_id=eq." +
        encodeURIComponent(userId),
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: "Bearer " + supabaseKey
        },
        body: JSON.stringify({
          chat_count: newCount
        })
      }
    );

    return res.status(200).json({
      answer: answer.trim(),
      chatsRemaining:
        MAX_AI_CHATS - newCount
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Server error"
    });
  }
};
