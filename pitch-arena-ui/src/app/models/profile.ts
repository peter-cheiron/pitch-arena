import { Location } from "./core/location";

export interface Profile {
    roles: string[];
    email: string;
    userId: string;
    country?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    about?: string;
    profileImage?: string;
    location?: Location;
    locale?: string;
}