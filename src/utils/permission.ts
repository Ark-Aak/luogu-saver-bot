import { config } from "@/config";

export function isSuperUser(id: number) {
    return config.napcat.superuser.includes(id);
}