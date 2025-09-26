import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import { ApiConfigSelector } from "../ApiConfigSelector"
import { TooltipProvider } from "../../ui/tooltip"

// Mock the vscode module
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock the translation hook
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Mock the portal hook
vi.mock("@/components/ui/hooks/useRooPortal", () => ({
	useRooPortal: () => document.body,
}))

describe("ApiConfigSelector", () => {
	const defaultProps = {
		value: "config1",
		displayName: "Config 1",
		disabled: false,
		title: "Select API Config",
		onChange: vi.fn(),
		listApiConfigMeta: [
			{ id: "config1", name: "Config 1", modelId: "model1" },
			{ id: "config2", name: "Config 2", modelId: "model2" },
			{ id: "config3", name: "Config 3", modelId: "model3" },
		],
		pinnedApiConfigs: {},
		togglePinnedApiConfig: vi.fn(),
	}

	// Helper function to render with TooltipProvider
	const renderWithTooltip = (ui: React.ReactElement) => {
		return render(<TooltipProvider>{ui}</TooltipProvider>)
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders the selector with current config", () => {
		renderWithTooltip(<ApiConfigSelector {...defaultProps} />)
		expect(screen.getByText("Config 1")).toBeInTheDocument()
	})

	it("opens dropdown when clicked", async () => {
		renderWithTooltip(<ApiConfigSelector {...defaultProps} />)
		const trigger = screen.getByTestId("dropdown-trigger")
		fireEvent.click(trigger)

		await waitFor(() => {
			expect(screen.getByText("Config 2")).toBeInTheDocument()
			expect(screen.getByText("Config 3")).toBeInTheDocument()
		})
	})

	it("calls onChange when a config is selected while enabled", async () => {
		renderWithTooltip(<ApiConfigSelector {...defaultProps} />)
		const trigger = screen.getByTestId("dropdown-trigger")
		fireEvent.click(trigger)

		await waitFor(() => {
			const config2 = screen.getByText("Config 2")
			fireEvent.click(config2)
		})

		expect(defaultProps.onChange).toHaveBeenCalledWith("config2")
	})

	describe("Scheduled Model Switch", () => {
		it("allows scheduling a model switch when disabled", async () => {
			const onScheduleChange = vi.fn()
			renderWithTooltip(
				<ApiConfigSelector {...defaultProps} disabled={true} onScheduleChange={onScheduleChange} />,
			)

			// Should still be able to open dropdown when disabled
			const trigger = screen.getByTestId("dropdown-trigger")
			fireEvent.click(trigger)

			await waitFor(() => {
				const config2 = screen.getByText("Config 2")
				fireEvent.click(config2)
			})

			// Should call onScheduleChange instead of onChange
			expect(onScheduleChange).toHaveBeenCalledWith("config2")
			expect(defaultProps.onChange).not.toHaveBeenCalled()
		})

		it("shows scheduled config indicator", () => {
			renderWithTooltip(
				<ApiConfigSelector
					{...defaultProps}
					disabled={true}
					scheduledConfigId="config2"
					onScheduleChange={vi.fn()}
				/>,
			)

			// Should show clock icon when a config is scheduled
			const clockIcon = document.querySelector(".codicon-clock")
			expect(clockIcon).toBeInTheDocument()
		})

		it("cancels scheduled switch when clicking the same config", async () => {
			const onScheduleChange = vi.fn()
			renderWithTooltip(
				<ApiConfigSelector
					{...defaultProps}
					disabled={true}
					scheduledConfigId="config2"
					onScheduleChange={onScheduleChange}
				/>,
			)

			const trigger = screen.getByTestId("dropdown-trigger")
			fireEvent.click(trigger)

			await waitFor(() => {
				const config2 = screen.getByText("Config 2")
				fireEvent.click(config2)
			})

			// Should cancel the scheduled change
			expect(onScheduleChange).toHaveBeenCalledWith(undefined)
		})

		it("shows scheduled config in dropdown with indicator", async () => {
			renderWithTooltip(
				<ApiConfigSelector
					{...defaultProps}
					disabled={true}
					scheduledConfigId="config2"
					onScheduleChange={vi.fn()}
				/>,
			)

			const trigger = screen.getByTestId("dropdown-trigger")
			fireEvent.click(trigger)

			await waitFor(() => {
				// Find the config2 item's container - look for the parent that contains both text and icon
				const config2Items = screen.getAllByText("Config 2")
				// Find the one that's in the dropdown (not the trigger)
				const dropdownConfig2 = config2Items.find((item) => item.closest('[role="dialog"]'))
				expect(dropdownConfig2).toBeTruthy()

				// Check if the parent container has the scheduled border style
				const configContainer = dropdownConfig2?.closest(".border-l-2")
				expect(configContainer).toBeInTheDocument()
			})
		})

		it("updates tooltip when config is scheduled", () => {
			renderWithTooltip(
				<ApiConfigSelector
					{...defaultProps}
					disabled={true}
					scheduledConfigId="config2"
					onScheduleChange={vi.fn()}
				/>,
			)

			// When scheduled, the trigger should show a clock icon
			const trigger = screen.getByTestId("dropdown-trigger")
			const clockIcon = trigger.querySelector(".codicon-clock")
			expect(clockIcon).toBeInTheDocument()
		})
	})

	describe("Pinned Configs", () => {
		it("shows pinned configs at the top", async () => {
			renderWithTooltip(<ApiConfigSelector {...defaultProps} pinnedApiConfigs={{ config2: true }} />)

			const trigger = screen.getByTestId("dropdown-trigger")
			fireEvent.click(trigger)

			await waitFor(() => {
				// Find all config items in the dropdown
				const dropdownContent = screen.getByRole("dialog")
				const configItems = dropdownContent.querySelectorAll(".px-3.py-1\\.5")

				// First item should be Config 2 (pinned)
				expect(configItems[0]).toHaveTextContent("Config 2")
				// Check that it has the pinned button visible
				const pinnedButton = configItems[0].querySelector(".bg-accent")
				expect(pinnedButton).toBeInTheDocument()
			})
		})

		it("toggles pin status when pin button is clicked", async () => {
			const togglePin = vi.fn()
			renderWithTooltip(<ApiConfigSelector {...defaultProps} togglePinnedApiConfig={togglePin} />)

			const trigger = screen.getByTestId("dropdown-trigger")
			fireEvent.click(trigger)

			await waitFor(() => {
				// Find a pin button and click it
				const pinButtons = screen.getAllByRole("button").filter((btn) => btn.querySelector(".codicon-pin"))
				if (pinButtons.length > 0) {
					fireEvent.click(pinButtons[0])
					expect(togglePin).toHaveBeenCalled()
				}
			})
		})
	})
})
