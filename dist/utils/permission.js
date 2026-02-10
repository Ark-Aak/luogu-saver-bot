import { config } from "@/config";
export function isSuperUser(id) {
    return config.napcat.superuser.includes(id);
}
