import type firebase from "firebase/app";
import { Platform } from "react-native";
import serviceConfig from "../../serviceConfig";
import { AuthenticationClient, UserRecord } from "./authenticationClient";
import isBrowserStorageAvailable from "./isBrowserStorageAvailable";

export class FirebaseOpaqueLoginToken {
  _token: string;

  constructor(tokenStringRepresentation: string) {
    this._token = tokenStringRepresentation;
  }

  toString(): string {
    return this._token;
  }
}

export class FirebaseOpaqueIDToken {
  _token: string;

  constructor(tokenStringRepresentation: string) {
    this._token = tokenStringRepresentation;
  }

  toString(): string {
    return this._token;
  }
}

export default class FirebaseAuthenticationClient
  implements
    AuthenticationClient<FirebaseOpaqueLoginToken, FirebaseOpaqueIDToken> {
  private _auth: firebase.auth.Auth; // access through auth()
  private authConfigurationPromise: Promise<void>;

  constructor(auth: firebase.auth.Auth) {
    this._auth = auth;
    this.authConfigurationPromise = this.configureAuth();
  }

  private async configureAuth() {
    if (Platform.OS === "web") {
      const browserStorageAvailable = await isBrowserStorageAvailable();
      await this._auth.setPersistence(
        browserStorageAvailable ? "local" : "none",
      );
    }
  }

  private async auth(): Promise<firebase.auth.Auth> {
    await this.authConfigurationPromise;
    return this._auth;
  }

  private static getUserRecordForFirebaseUser(user: firebase.User | null) {
    return user
      ? {
          userID: user.uid,
          emailAddress: user.email,
        }
      : null;
  }

  subscribeToUserAuthState(
    callback: (userRecord: UserRecord | null) => void,
  ): () => void {
    let unsubscribe: (() => void) | null = null;
    this.auth().then((auth) => {
      unsubscribe = auth.onAuthStateChanged((newUser) => {
        const newUserRecord = FirebaseAuthenticationClient.getUserRecordForFirebaseUser(
          newUser,
        );
        console.log("Current Orbit UID:", newUserRecord);
        callback(newUserRecord);
      });
    });
    return () => {
      unsubscribe?.();
    };
  }

  async getUserAuthState(): Promise<UserRecord | null> {
    const auth = await this.auth();
    return FirebaseAuthenticationClient.getUserRecordForFirebaseUser(
      auth.currentUser,
    );
  }

  async signInWithEmailAndPassword(email: string, password: string) {
    const auth = await this.auth();
    return auth.signInWithEmailAndPassword(email, password);
  }

  async createUserWithEmailAndPassword(email: string, password: string) {
    const auth = await this.auth();
    return auth.createUserWithEmailAndPassword(email, password);
  }

  async userExistsWithEmail(email: string) {
    const auth = await this.auth();
    const methods = await auth.fetchSignInMethodsForEmail(email);
    return methods.length > 0;
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    const auth = await this.auth();
    return auth.sendPasswordResetEmail(email);
  }

  async getCurrentIDToken(): Promise<FirebaseOpaqueIDToken> {
    const auth = await this.auth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken(true);
      return new FirebaseOpaqueIDToken(idToken);
    } else {
      throw new Error("Not signed in");
    }
  }

  async getLoginTokenUsingSessionCookie(): Promise<FirebaseOpaqueLoginToken> {
    const fetchResult = await fetch(
      `${serviceConfig.httpsAPIBaseURLString}/internal/auth/createLoginToken`,
    );
    if (fetchResult.ok) {
      const loginToken = await fetchResult.text();
      return new FirebaseOpaqueLoginToken(loginToken);
    } else {
      throw new Error(
        `Sign in failed with status code ${
          fetchResult.status
        }: ${await fetchResult.text()}`,
      );
    }
  }

  async getLoginTokenUsingIDToken(
    idToken: FirebaseOpaqueIDToken,
  ): Promise<FirebaseOpaqueLoginToken> {
    const fetchResult = await fetch(
      `${serviceConfig.httpsAPIBaseURLString}/internal/auth/createLoginToken?idToken=${idToken._token}`,
    );
    if (fetchResult.ok) {
      const loginToken = await fetchResult.text();
      return new FirebaseOpaqueLoginToken(loginToken);
    } else {
      throw new Error(
        `Sign in failed with status code ${
          fetchResult.status
        }: ${await fetchResult.text()}`,
      );
    }
  }

  async signInWithLoginToken(
    loginToken: FirebaseOpaqueLoginToken,
  ): Promise<unknown> {
    const auth = await this.auth();
    await auth.signInWithCustomToken(loginToken._token);
    return;
  }

  async getLoginTokenUsingAccessCode(accessCode: string) {
    const fetchResult = await fetch(
      `${serviceConfig.httpsAPIBaseURLString}/internal/auth/consumeAccessCode?accessCode=${accessCode}`,
    );
    if (fetchResult.ok) {
      const loginToken = await fetchResult.text();
      return new FirebaseOpaqueLoginToken(loginToken);
    } else {
      throw new Error(
        `Couldn't consume access code ${
          fetchResult.status
        }: ${await fetchResult.text()}`,
      );
    }
  }

  async refreshSessionCookie(idToken: FirebaseOpaqueIDToken): Promise<unknown> {
    const fetchResult = await fetch(
      `${serviceConfig.httpsAPIBaseURLString}/internal/auth/refreshSessionCookie?idToken=${idToken._token}`,
    );
    if (!fetchResult.ok) {
      throw new Error(
        `Failed to refresh session cookie with status code ${
          fetchResult.status
        }: ${await fetchResult.text()}`,
      );
    }
    return;
  }

  supportsCredentialPersistence(): Promise<boolean> {
    return isBrowserStorageAvailable();
  }
}
