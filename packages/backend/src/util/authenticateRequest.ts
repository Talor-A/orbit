import { API as ApiType } from "@withorbit/api";
import express from "express";
import {
  CachePolicy,
  TypedRequest,
  TypedResponse,
  TypedRouteHandler,
} from "../api/util/typedRouter";
import * as backend from "../backend";

export async function authenticateRequest(
  request: express.Request,
  response: express.Response,
  next: (userID: string) => void,
): Promise<void> {
  authenticateTypedRequest(request, async (userID) => {
    next(userID);
    // HACK Not actually used:
    return { status: 200, json: undefined, cachePolicy: CachePolicy.NoStore };
  });
}

export async function authenticateTypedRequest<
  API extends ApiType.Spec,
  Path extends Extract<keyof API, string>,
  Method extends Extract<keyof API[Path], ApiType.HTTPMethod>
>(
  request: TypedRequest<API[Path][Method]>,
  next: (
    userID: string,
  ) => Promise<TypedResponse<ApiType.RouteResponseData<API[Path][Method]>>>,
): Promise<TypedResponse<ApiType.RouteResponseData<API[Path][Method]>>> {
  const authorizationHeader = request.header("Authorization");
  if (authorizationHeader) {
    const match = authorizationHeader.match(/ID (.+)/);
    if (match) {
      try {
        return next(await backend.auth.validateIDToken(match[1]));
      } catch (error) {
        console.error(`Couldn't validate ID token: ${error}`);
        return { status: 401 };
      }
    } else {
      const match = authorizationHeader.match(/Token (.+)/);
      if (match) {
        try {
          return next(await backend.auth.consumeAccessCode(match[1]));
        } catch (error) {
          console.error(`Couldn't consume access token: ${error}`);
          return { status: 401 };
        }
      } else {
        console.error(`Unknown authorization scheme`);
        return { status: 401 };
      }
    }
  } else {
    const accessCode = (request.query as any)["accessCode"];
    if (accessCode && typeof accessCode === "string") {
      let userID: string;
      try {
        userID = await backend.auth.consumeAccessCode(accessCode, Date.now());
      } catch (error) {
        console.error(`Couldn't consume access code ${accessCode}: ${error}`);
        return { status: 401 };
      }
      return next(userID);
    } else {
      return { status: 401 };
    }
  }
}

export function authenticatedRequestHandler<
  API extends ApiType.Spec,
  Path extends Extract<keyof API, string>,
  Method extends Extract<keyof API[Path], ApiType.HTTPMethod>
>(
  handler: (
    request: TypedRequest<API[Path][Method]>,
    userID: string,
  ) => Promise<TypedResponse<ApiType.RouteResponseData<API[Path][Method]>>>,
): TypedRouteHandler<API, Path, Method> {
  return (request) =>
    authenticateTypedRequest(request, (userID) => handler(request, userID));
}
