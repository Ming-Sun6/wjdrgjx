import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CalculatorApp } from "./App";
import { APP_TITLE } from "../app/version";
import "./styles.css";
document.title = APP_TITLE;
createRoot(document.getElementById("root")!).render(<StrictMode><CalculatorApp /></StrictMode>);
