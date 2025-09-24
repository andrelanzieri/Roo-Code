import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import RooTips from "../RooTips"

// Mock react-i18next
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	Trans: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
	ReplaceAll: ({ className }: { className?: string }) => <div data-testid="replace-all-icon" className={className} />,
	ChefHat: ({ className }: { className?: string }) => <div data-testid="chef-hat-icon" className={className} />,
	Keyboard: ({ className }: { className?: string }) => <div data-testid="keyboard-icon" className={className} />,
	Wifi: ({ className }: { className?: string }) => <div data-testid="wifi-icon" className={className} />,
	Github: () => null,
	Router: () => null,
}))

describe("RooTips", () => {
	it("renders the welcome heading", () => {
		render(<RooTips />)
		expect(screen.getByText("Welcome to Roo Code!")).toBeInTheDocument()
	})

	it("renders the subtitle", () => {
		render(<RooTips />)
		expect(screen.getByText("Roo is a powerful AI Coding assistant for serious work:")).toBeInTheDocument()
	})

	it("renders all tip items", () => {
		render(<RooTips />)

		// Check titles
		expect(screen.getByText("Model-agnostic")).toBeInTheDocument()
		expect(screen.getByText("Extensible Role-specific Modes")).toBeInTheDocument()
		expect(screen.getByText("Highly customizable")).toBeInTheDocument()
		expect(screen.getByText("Produce from anywhere")).toBeInTheDocument()

		// Check descriptions
		expect(screen.getByText("Bring your own key, no markup or lock-in")).toBeInTheDocument()
		expect(
			screen.getByText("Focus the LLM of activities like planning, coding, merging conflicts and more"),
		).toBeInTheDocument()
		expect(screen.getByText("Tweak the details that matter to make it work for you")).toBeInTheDocument()
		expect(
			screen.getByText("Follow and control Roo from any device with Roo Code Cloud (optional)"),
		).toBeInTheDocument()
	})

	it("renders all icons", () => {
		render(<RooTips />)

		expect(screen.getByTestId("replace-all-icon")).toBeInTheDocument()
		expect(screen.getByTestId("chef-hat-icon")).toBeInTheDocument()
		expect(screen.getByTestId("keyboard-icon")).toBeInTheDocument()
		expect(screen.getByTestId("wifi-icon")).toBeInTheDocument()
	})

	it("renders the docs link text", () => {
		render(<RooTips />)
		expect(screen.getByText("Learn more in the Docs")).toBeInTheDocument()
	})

	it("applies correct CSS classes to list items", () => {
		const { container } = render(<RooTips />)
		const listItems = container.querySelectorAll("li")

		expect(listItems).toHaveLength(4)
		listItems.forEach((item) => {
			expect(item).toHaveClass("flex", "items-start", "gap-2")
		})
	})

	it("applies correct CSS classes to icons", () => {
		render(<RooTips />)

		const icons = [
			screen.getByTestId("replace-all-icon"),
			screen.getByTestId("chef-hat-icon"),
			screen.getByTestId("keyboard-icon"),
			screen.getByTestId("wifi-icon"),
		]

		icons.forEach((icon) => {
			expect(icon).toHaveClass("size-4", "mt-1", "shrink-0")
		})
	})
})
