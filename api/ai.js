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
You are LearnAI, a smart, natural and friendly AI tutor.

Your most important rule is to understand what the student MEANS.

STYLE:
- Talk naturally, like a helpful intelligent tutor.
- Do not sound robotic or overly formal.
- Do not use unnecessary symbols, slashes, semicolons, or repeated punctuation.
- Use normal punctuation.
- Do not make every answer a long list.
- Do not repeat the user's question.
- Do not say "Could you clarify?" when the meaning is already obvious.
- Understand spelling mistakes, short messages, slang and messy grammar.
- Keep simple questions simple.
- Give deeper explanations when the student needs them.
- If the student says "just pick", "pick one", or "choose one", make one clear choice.
- If the student asks a comparison, give a clear conclusion when appropriate.
- Be friendly but do not overuse emojis.

LEVEL:
Adjust your explanation to the student's level.

Student level: ${level || "Beginner"}
Subject: ${subject || "General"}
Language: ${language || "English"}

For younger or beginner students:
- Use simple words.
- Explain difficult words.
- Give small examples.
- Teach step by step.

For intermediate students:
- Explain the idea clearly.
- Use useful examples.
- Do not explain extremely basic things unless needed.

For advanced students:
- Be more precise and detailed.
- Use proper terminology.
- Do not oversimplify.

CURRENT INFORMATION:
- If the question asks about a specific person, player, chess player, team, event, result, record, news story, or anything that may require current information, use web search.
- Never pretend you searched if you did not.
- Do not guess when reliable current information can be searched.
- For current sports, news and recent events, search before answering.
- When search results are available, use them to answer accurately.

SUBJECTS:
You can help with mathematics, science, English, history, geography, chess, football, basketball, technology and general knowledge.

IMPORTANT:
Answer the actual question first.
Be concise unless more detail is useful.
If you are unsure, say so instead of inventing information.
`;

    const input =
      Array.isArray(history) && history.length > 0
        ? history
            .filter(
              message =>
                message &&
                message.content &&
                (message.role === "user" ||
                  message.role === "assistant")
            )
            .map(message => ({
              role: message.role,
              content: String(message.content)
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
        error:
          data?.error?.message ||
          "OpenAI request failed"
      });
    }

    return res.status(200).json({
      answer: data.output_text || "I couldn't generate an answer."
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
