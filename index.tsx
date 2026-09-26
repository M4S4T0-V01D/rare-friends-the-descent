"use client";

import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { DescentApp } from "./src/ui/App";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

/**
 * Rare Friends: The Descent.
 * The FriendSDK runtime supplies wallet connection, owned Friend selection and the fresh
 * Generations ownership check before this component mounts. The game never touches a wallet.
 */
export default function Descent(props: GameComponentProps) {
  return <DescentApp {...props} />;
}
