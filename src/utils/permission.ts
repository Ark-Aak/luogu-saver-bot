import { config } from "@/config";

function isSuperUser(id: number) {
    return config.napcat.superuser.includes(id);
}