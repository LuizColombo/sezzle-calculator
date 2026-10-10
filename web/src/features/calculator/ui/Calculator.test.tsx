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

describe("Calculator", () => {
  it("computes 1 + 2 = 3 through the API", async () => {
    render(<Calculator />);
    await press("1", "add", "2", "equals");
    await waitFor(() => {
      expect(display()).toHaveTextContent("3");
    });
    expect(screen.getByText("1 + 2 =")).toBeInTheDocument();
  });

  it("shows the active operator until the second operand starts", async () => {
    render(<Calculator />);
    await press("9", "multiply");
    expect(screen.getByRole("button", { name: "multiply" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await press("2");
    expect(screen.getByRole("button", { name: "multiply" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows Error with the API detail on division by zero, then recovers", async () => {
    render(<Calculator />);
    await press("1", "divide", "0", "equals");
    await waitFor(() => {
      expect(display()).toHaveTextContent("Error");
    });
    expect(screen.getByText("division by zero")).toBeInTheDocument();
    await press("4");
    expect(display()).toHaveTextContent("4");
  });

  it("shows a banner when the API is unreachable and recovers on retry", async () => {
    server.use(http.post("/api/v1/add", () => HttpResponse.error()));
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

  it("evaluates on Enter after keys were clicked, instead of re-pressing the last key", async () => {
    render(<Calculator />);
    await press("1", "add", "2");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(display()).toHaveTextContent("3");
    });
  });

  it("shows power as the active operator", async () => {
    render(<Calculator />);
    await press("2", "power");
    expect(screen.getByRole("button", { name: "power" })).toHaveAttribute("aria-pressed", "true");
  });

  it("announces the API's error detail in the live region", async () => {
    render(<Calculator />);
    await press("1", "divide", "0", "equals");
    await waitFor(() => {
      expect(display()).toHaveTextContent(/Error.*division by zero/);
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

  it("evaluates with precedence in scientific mode", async () => {
    render(<Calculator />);
    await userEvent.click(screen.getByRole("radio", { name: "Scientific" }));
    await userEvent.keyboard("2+3*4{Enter}");
    await waitFor(() => {
      expect(display()).toHaveTextContent("14");
    });
    expect(screen.getByRole("region", { name: "display" })).toHaveTextContent("2 + 3 × 4 =");
  });

  it("evaluates parentheses from the scientific keypad", async () => {
    render(<Calculator />);
    await userEvent.click(screen.getByRole("radio", { name: "Scientific" }));
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

  it("links to the API reference", () => {
    render(<Calculator />);
    expect(screen.getByRole("link", { name: /api docs/i })).toHaveAttribute("href", "/docs");
  });
});
