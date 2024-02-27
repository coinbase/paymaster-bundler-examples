import { http } from "viem";
import config from '../config.json' with { type: 'json' };

export const extractHashFromError = (errorString) => {
    const regex = /Transaction with hash "([^"]+)"/;
    const match = errorString.match(regex);

    if (match && match.length > 1) {
        return match[1];
    } else {
        return null;
    }
}

export const transport = http(config.rpc_url)