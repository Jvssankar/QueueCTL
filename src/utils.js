import { v4 as uuidv4 } from "uuid";

export const nowISO = () => new Date().toISOString();
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
export const genId = (prefix = "job") => `${prefix}-${uuidv4()}`;
