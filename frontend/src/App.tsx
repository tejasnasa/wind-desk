import { NavLink, Route, Routes } from "react-router-dom";
import { Accuracy } from "./pages/Accuracy";
import { DecisionBoard } from "./pages/DecisionBoard";
import { Methodology } from "./pages/Methodology";
import { Overview } from "./pages/Overview";

const NAV = [
    { to: "/", label: "Overview", end: true },
    { to: "/decision", label: "Decision board", end: false },
    { to: "/accuracy", label: "Accuracy", end: false },
    { to: "/methodology", label: "Methodology", end: false },
];

export function App() {
    return (
        <>
            <header className="topbar">
                <div className="topbar__inner">
                    <div className="wordmark">
                        <span className="wordmark__name">
                            Wind<em>·</em>Desk
                        </span>
                        <span className="wordmark__tag">
                            day-ahead wind forecast &amp; error analytics
                        </span>
                    </div>
                    <nav className="nav">
                        {NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    isActive ? "is-active" : ""
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="topbar__meta">
                        Elexon WINDFOR + FUELHH
                        <br />
                        gate closure 11:00 Europe/London
                    </div>
                </div>
            </header>

            <main className="page">
                <Routes>
                    <Route path="/" element={<Overview />} />
                    <Route path="/decision" element={<DecisionBoard />} />
                    <Route path="/accuracy" element={<Accuracy />} />
                    <Route path="/methodology" element={<Methodology />} />
                </Routes>
            </main>

            <footer className="footer">
                <span>Wind Desk · pilot build</span>
                <span>
                    data: Elexon Insights API (FUELHH actuals, WINDFOR
                    forecasts)
                </span>
                <span>scope: national wind, January 2026 decisions</span>
                <span>
                    AI tooling was used to assist development — see the README
                </span>
            </footer>
        </>
    );
}
