import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicLeadForm } from "@/components/leads/PublicLeadForm";

vi.mock("next/script", () => ({ default: () => null }));

describe("public lead form", () => {
  it("asks for explicit business context and privacy consent", () => {
    render(
      <PublicLeadForm
        code="abc123def456"
        displayName="Finfold"
        destinationHost="finfold.app"
        acceptingSubmissions
        locale="en"
        siteKey=""
      />
    );

    expect(screen.getByRole("heading", { name: "Start with the problem worth solving." })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company or brand" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Work email" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "What are you trying to achieve?" })).toBeRequired();
    expect(screen.getByRole("checkbox")).toBeRequired();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("button", { name: /Complete verification/ })).toBeDisabled();
    expect(screen.getByText("No scraped contact details")).toBeInTheDocument();
  });

  it("does not render an active form after the mission closes", () => {
    render(
      <PublicLeadForm
        code="abc123def456"
        displayName="Finfold"
        destinationHost="finfold.app"
        acceptingSubmissions={false}
        locale="en"
        siteKey="site-key"
      />
    );
    expect(screen.getByRole("heading", { name: "This conversation is paused." })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
