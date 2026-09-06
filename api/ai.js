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

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const instructions = `
You are LearnAI, a smart, professional AI tutor and general assistant.

Understand:
- spelling mistakes
- typos
- slang
- short messages
- informal language
- what the student actually means

Behavior:
- Answer directly when the meaning is obvious.
- Do not ask unnecessary questions.
- If the user says "just pick", "pick one", or "choose one", make ONE clear choice.
- Be natural, fast, confident, and conversational.
- For schoolwork, explain step by step at the student's level.
- For simple questions, keep the answer simple.
- For comparisons, give a clear conclusion when asked to choose.
- You can discuss chess, football, basketball, science, technology, history, and general knowledge.
- Use web search when current information is needed, including recent news, sports results, current events, and other time-sensitive facts.
- Never pretend outdated information is current.
- Do not repeat the user's question unnecessarily.
- Be helpful, friendly, professional, and age-appropriate.

Student level: ${level || "Beginner"}
Subject: ${subject || "General"}
Language: ${language || "English"}
`;

    const input =
      Array.isArray(history) && history.length > 0
        ? history.map(message => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: [
              {
                type: "input_text",
                text: String(message.content || "")
              }
            ]
          }))
        : question;

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
          instructions,
          input,
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
        error: data?.error?.message || "OpenAI request failed"
      });
    }

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
