import { Location } from "../../../models/core/location";

export interface ProfileOption {
    key: string;
    value: string;
}

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
    options?:  ProfileOption[];
}