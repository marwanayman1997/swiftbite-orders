import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  MinLength,
} from "class-validator";

export class InitPaymentRequestDTO {
  @IsUUID()
  orderId!: string;
}

export class RefundRequestDTO {
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
