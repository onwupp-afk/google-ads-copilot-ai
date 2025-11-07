import OpenAI from "openai";

export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function testConnection() {
  if (!openai) return null;
  try {
    const res = await openai.responses.create({
      model: "gpt-4o-mini",
      input: "Test connection successful",
    });
    return res.output?.[0]?.content?.[0]?.text ?? "ok";
  } catch (error) {
    console.error("❌ OpenAI connection failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
