import { FastifyRequest } from "fastify";

export async function auth(req: FastifyRequest) {
  const expected = process.env.OPERATOR_TOKEN;
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "");
  if (!expected || !match || match[1] !== expected)
    throw { statusCode: 401, error: "unauthorized" };
}
