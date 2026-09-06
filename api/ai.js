export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, subject, level } = req.body || {};

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        instructions: `You are the LearnAI AI Tutor.
Be friendly, patient, encouraging, respectful and calm.
Explain things clearly and step by step.
Match explanations to the student's level.
Subject: ${subject || "General"}
Student level: ${level || "Beginner"}
Keep answers age-appropriate and educational.`,
        input: question
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OPENAI ERROR:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI request failed"
      });
    }

    // Get text from the Responses API output
    const answer =
      data.output_text ||
      data.output
        ?.flatMap(item => item.content || [])
        ?.map(content => content.text)
        ?.filter(Boolean)
        ?.join("\n") ||
      "No answer was returned.";

    return res.status(200).json({ answer });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
