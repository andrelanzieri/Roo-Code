import { render, screen } from "@/utils/test-utils"

import { TranslationProvider } from "@/i18n/__mocks__/TranslationContext"

import { AutoApproveToggle, autoApproveSettingsConfig } from "../AutoApproveToggle"

vi.mock("@/i18n/TranslationContext", () => {
	const actual = vi.importActual("@/i18n/TranslationContext")
	return {
		...actual,
		useAppTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

// Mock ExtensionState with browserToolEnabled = false to verify visibility gating
vi.mock("@/context/ExtensionStateContext", () => {
	return {
		useExtensionState: () => ({ browserToolEnabled: false }),
		ExtensionStateContextProvider: ({ children }: any) => children,
	}
})

describe("AutoApproveToggle - hidden Browser toggle when browser tool disabled", () => {
	const initialProps = {
		alwaysAllowReadOnly: true,
		alwaysAllowWrite: false,
		alwaysAllowBrowser: false,
		alwaysApproveResubmit: true,
		alwaysAllowMcp: false,
		alwaysAllowModeSwitch: true,
		alwaysAllowSubtasks: false,
		alwaysAllowExecute: true,
		alwaysAllowFollowupQuestions: false,
		alwaysAllowUpdateTodoList: true,
		onToggle: vi.fn(),
	}

	test("does not render the Browser auto-approve toggle when browserToolEnabled is false", () => {
		render(
			<TranslationProvider>
				<AutoApproveToggle {...initialProps} />
			</TranslationProvider>,
		)

		// Browser toggle should be hidden
		const browserToggle = screen.queryByTestId(autoApproveSettingsConfig.alwaysAllowBrowser.testId)
		expect(browserToggle).toBeNull()

		// A non-browser toggle should still be present to ensure the component renders others
		const readOnlyToggle = screen.getByTestId(autoApproveSettingsConfig.alwaysAllowReadOnly.testId)
		expect(readOnlyToggle).toBeInTheDocument()
	})
})
