// Shared Prisma error builders for unit tests of Prisma-dependent branches
// (e.g. error translation in the central error handler).
import { Prisma } from '../../../src/generated/prisma/client.ts';

export function prismaKnownError(
  code: string,
  message = `Prisma error ${code}`,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: 'test',
  });
}
