import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from "class-validator";
import { DeliveryStatus } from "../enums.ts";

export class AssignDeliveryRequestDTO {
  @IsOptional()
  @IsInt()
  @Min(1)
  agentId?: number;
}

export class UpdateDeliveryStatusRequestDTO {
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
