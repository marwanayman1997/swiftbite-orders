import { validate, type ValidationError } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AppError } from "../error/AppError.ts";

function flattenConstraints(errors: ValidationError[]): string[] {
  return errors.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...flattenConstraints(e.children ?? []),
  ]);
}

async function validateInstance<T extends Object>(
  cls: new () => T,
  data: unknown,
): Promise<T> {
  // A request with no body at all (all-optional DTOs, e.g. AssignDeliveryRequestDTO)
  // leaves body as undefined — plainToInstance/class-validator crash on that
  // rather than validating an empty object, so normalize it first.
  const instance = plainToInstance(cls, data ?? {});
  const errors = await validate(instance, { whitelist: true });

  if (errors.length > 0) {
    const messages = flattenConstraints(errors);
    throw new AppError(messages.join(", \n"), 400);
  }
  return instance;
}

export function validateBody<T extends Object>(
  cls: new () => T,
  body: unknown,
): Promise<T> {
  return validateInstance(cls, body);
}

export function validateParams<T extends Object>(
  cls: new () => T,
  params: unknown,
): Promise<T> {
  return validateInstance(cls, params);
}
