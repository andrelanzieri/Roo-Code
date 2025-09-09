import path from "path"
import delay from "delay"
import * as vscode from "vscode"
import fs from "fs/promises"

import { RooTool } from "../base/RooTool"
import { Task } from "../../task/Task"
import { ClineSayTool } from "../../../shared/ExtensionMessage"
import { formatResponse } from "../../prompts/responses"
import {
	ToolUse,
	AskApproval,
	HandleError,
	PushToolResult,
	RemoveClosingTag,
	ToolParamName,
} from "../../../shared/tools"
import { ToolName, ToolGroup } from "@roo-code/types"
import { ToolArgs } from "../../prompts/tools/types"
import { RecordSource } from "../../context-tracking/FileContextTrackerTypes"
import { fileExistsAtPath } from "../../../utils/fs"
import { stripLineNumbers, everyLineHasLineNumbers } from "../../../integrations/misc/extract-text"
import { getReadablePath } from "../../../utils/path"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { detectCodeOmission } from "../../../integrations/editor/detect-omission"
import { unescapeHtmlEntities } from "../../../utils/text-normalization"
import { DEFAULT_WRITE_DELAY_MS } from "@roo-code/types"
import { EXPERIMENT_IDS, experiments } from "../../../shared/experiments"

/**
 * WriteToFileTool - A tool for writing content to files
 * This class consolidates all logic related to the write_to_file tool
 * including its description, parameters, and implementation.
 */
export class WriteToFileTool extends RooTool {
	get name(): ToolName {
		return "write_to_file"
	}

	get groups(): ToolGroup[] {
		return ["edit"]
	}

	get requiredParams(): ToolParamName[] {
		return ["path", "content", "line_count"]
	}

	get optionalParams(): ToolParamName[] {
		return []
	}

	getDescription(args: ToolArgs): string {
		return `## write_to_file
Description: Request to write content to a file. This tool is primarily used for **creating new files** or for scenarios where a **complete rewrite of an existing file is intentionally required**. If the file exists, it will be overwritten. If it doesn't exist, it will be created. This tool will automatically create any directories needed to write the file.
Parameters:
- path: (required) The path of the file to write to (relative to the current workspace directory ${args.cwd})
- content: (required) The content to write to the file. When performing a full rewrite of an existing file or creating a new one, ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions. You MUST include ALL parts of the file, even if they haven't been modified. Do NOT include the line numbers in the content though, just the actual content of the file.
- line_count: (required) The number of lines in the file. Make sure to compute this based on the actual content of the file, not the number of lines in the content you're providing.
Usage:
<write_to_file>
<path>File path here</path>
<content>
Your file content here
</content>
<line_count>total number of lines in the file, including empty lines</line_count>
</write_to_file>

Example: Requesting to write to frontend-config.json
<write_to_file>
<path>frontend-config.json</path>
<content>
{
  "apiEndpoint": "https://api.example.com",
  "theme": {
    "primaryColor": "#007bff",
    "secondaryColor": "#6c757d",
    "fontFamily": "Arial, sans-serif"
  },
  "features": {
    "darkMode": true,
    "notifications": true,
    "analytics": false
  },
  "version": "1.0.0"
}
</content>
<line_count>14</line_count>
</write_to_file>`
	}

	getToolUsageDescription(block: ToolUse): string {
		return `[${block.name} to '${block.params.path}']`
	}

	async execute(
		cline: Task,
		block: ToolUse,
		askApproval: AskApproval,
		handleError: HandleError,
		pushToolResult: PushToolResult,
		removeClosingTag: RemoveClosingTag,
	): Promise<void> {
		// For now, we'll delegate to the existing implementation
		// In a full refactor, we would move all the logic here
		const { writeToFileTool } = await import("../writeToFileTool")
		return writeToFileTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
	}
}
