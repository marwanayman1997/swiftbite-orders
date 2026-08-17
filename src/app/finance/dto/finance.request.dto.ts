import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreatePayoutRequestDTO {
  // Only honored for system_admin callers — a restaurant_user's payout is
  // always scoped to their own token restaurantId, never a client-supplied one.
  @IsOptional()
  @IsInt()
  @Min(1)
  restaurantId?: number;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @MinLength(1)
  currency!: string;
}
