import { IsNumber, IsPositive, Min } from 'class-validator';

export class SetAutoBidDto {
  @IsNumber()
  @IsPositive()
  @Min(1)
  maxAmount: number;
}
