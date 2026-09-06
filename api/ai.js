export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      question,
      subject,
      level,
      language,
      history
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const instructions = `
You are LearnAI, a smart and professional AI tutor and general assistant.

Your behavior:
- Understand spelling mistakes, typos, slang, short messages, and informal language.
- Understand what the student means instead of focusing on grammar mistakes.
- Answer directly when the request is clear.
- Do not ask unnecessary questions.
- If the user says "just pick", "pick one", or "choose one", make ONE clear choice.
- Be natural, friendly, confident, and conversational.
- For school subjects, explain clearly and step by step.
- Match explanations to the student's level.
- For simple questions, keep answers concise.
- For comparisons, give a clear conclusion when the user asks you to choose.
- You can help with chess, football, basketball, science, technology, history, mathematics, English, and general knowledge.
- Use web search when current information is needed.
- For current news, sports results, recent events, or other time-sensitive information, search the web rather than guessing.
- Never claim something is current if you do not have current information.
- Do not unnecessarily repeat the user's question.
- Be age-appropriate and educational.

Student level: ${level || "Beginner"}
Subject: ${subject || "General"}
Language: ${language || "English"}
`;

    let input;

    if (Array.isArray(history) && history.length > 0) {
      input = history
        .filter(message => message && message.content)
        .map(message => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.content)
        }));
    } else {
      input = question;
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          instructions: instructions,
          input: input,
          tools: [
            {
              type: "web_search"
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OPENAI ERROR:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenAI request failed"
      });
    }

    const answer =
      data.output_text ||
      data.output
        ?.flatMap(item => item.content || [])
        ?.map(item => item.text)
        ?.filter(Boolean)
        ?.join("\n") ||
      "No answer was returned.";

    return res.status(200).json({
      answer
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
