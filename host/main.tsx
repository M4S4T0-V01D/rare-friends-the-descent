import { createRoot } from "react-dom/client";
import { parseChanceGame } from "@rarefriends/friendsdk/game";
import gameJson from "../game.json";
import { DescentHost } from "./DescentHost";
import { installSaveRelay } from "./saveRelay";
import { installShareRelay } from "./shareRelay";
import "@rarefriends/friendsdk/frame.css";
import "@rarefriends/friendsdk/runtime.css";
import "../host.css";
import "./picker.css";

const definition = parseChanceGame(gameJson);
installShareRelay();
installSaveRelay();
createRoot(document.getElementById("root")!).render(<DescentHost definition={definition} frameUrl="./game.html" />);
