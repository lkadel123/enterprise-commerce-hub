import type { RequestUser } from "./index.js";

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      customer?: import("./index.js").CustomerRequestUser;
    }
  }
}

export {};
