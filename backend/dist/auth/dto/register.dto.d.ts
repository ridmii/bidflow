import { UserRole } from '../../users/entities/user.entity';
export declare class RegisterDto {
    email: string;
    name: string;
    password: string;
    role?: UserRole;
}
