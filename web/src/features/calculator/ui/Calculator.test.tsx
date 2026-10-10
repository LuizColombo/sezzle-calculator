import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../test/server";
import { Calculator } from "./Calculator";

const press = async (...names: string[]) => {
  for (const name of names) await userEvent.click(screen.getByRole("button", { name }));
};

const display = () => screen.getByRole("status");
const region = () => screen.getByRole("region", { name: "display" });

describe("Calculator", () => {
  it("applies operator precedence: 2 + 3 × 4 = 14", async () => {
    render(<Calculator />);
    await press("2", "add", "3", "multiply", "4", "equals");
    await waitFor(() => {
      expect(display()).toHaveTextContent("14");
    });
    expect(region()).toHaveTextContent("2 + 3 × 4 =");
  });

  it("evaluates parentheses", async () => {
    render(<Calculator />);
    await press(
      "open parenthesis",
      "2",
      "add",
      "3",
      "close parenthesis",
      "multiply",
      "4",
      "equals",
    );
    await waitFor(() => {
      expect(display()).toHaveTextContent("20");
    });
  });

  it("shows a live preview while typing", async () => {
    render(<Calculator />);
    await press("2", "add", "3", "multiply", "4");
    expect(display()).toHaveTextContent("2 + 3 × 4");
    await waitFor(() => {
      expect(screen.getByTestId("preview")).toHaveTextContent("14");
    });
  });

  it("shows the API's detail on division by zero, then starts over", async () => {
    render(<Calculator />);
    await press("1", "divide", "0", "equals");
    await waitFor(() => {
      expect(region()).toHaveTextContent("division by zero");
    });
    await press("4");
    expect(display()).toHaveTextContent("4");
  });

  it("shows a banner when the API is unreachable and recovers on retry", async () => {
    server.use(http.post("/api/v1/evaluate", () => HttpResponse.error()));
    render(<Calculator tuning={{ attempts: 1 }} />);
    await press("1", "add", "2", "equals");
    expect(await screen.findByRole("alert")).toHaveTextContent(/can.t reach/i);

    server.resetHandlers();
    await press("Retry");
    await waitFor(() => {
      expect(display()).toHaveTextContent("3");
    });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("supports the physical keyboard", async () => {
    render(<Calculator />);
    await userEvent.keyboard("12*3{Enter}");
    await waitFor(() => {
      expect(display()).toHaveTextContent("36");
    });
    await userEvent.keyboard("{Escape}");
    expect(display()).toHaveTextContent("0");
  });

  it("evaluates on Enter after keys were clicked, instead of re-pressing the last key", async () => {
    render(<Calculator />);
    await press("1", "add", "2");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(display()).toHaveTextContent("3");
    });
  });

  it("recalls a history entry as an operand", async () => {
    render(<Calculator />);
    await userEvent.keyboard("2*3{Enter}");
    await waitFor(() => {
      expect(display()).toHaveTextContent("6");
    });
    await userEvent.keyboard("{Escape}");
    await press("History");
    await userEvent.click(await screen.findByRole("button", { name: /2 × 3 =.*6/ }));
    await press("add", "1", "equals");
    await waitFor(() => {
      expect(display()).toHaveTextContent("7");
    });
  });

  it("returns focus to the History button when the panel closes", async () => {
    render(<Calculator />);
    await press("History");
    await press("Done");
    expect(screen.getByRole("button", { name: "History" })).toHaveFocus();
  });

  it("switches between light and dark themes", async () => {
    document.documentElement.dataset.theme = "light";
    render(<Calculator />);
    await press("Switch to dark theme");
    expect(document.documentElement.dataset.theme).toBe("dark");
    await press("Switch to light theme");
    expect(document.documentElement.dataset.theme).toBe("light");
    delete document.documentElement.dataset.theme;
  });

  it("links to the API reference", () => {
    render(<Calculator />);
    expect(screen.getByRole("link", { name: /api docs/i })).toHaveAttribute("href", "/docs");
  });
});
