import { IsNumber } from "class-validator";

export class PresenceOnlineRequestDTO {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}
