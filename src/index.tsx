/* @refresh reload */
import { render } from "solid-js/web";

import "./styles/base.css";
import { initTheme } from "./theme/store";

void initTheme();
render(() => <div class="sp-chrome">SPAWN</div>, document.getElementById("root") as HTMLElement);
