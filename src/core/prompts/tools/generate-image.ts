import { ToolArgs } from "./types"

export function getGenerateImageDescription(args: ToolArgs): string {
	return `## generate_image
Description: Request to generate or edit an image using AI models through OpenRouter API. This tool can create new images from text prompts or modify existing images based on your instructions. When an input image is provided, the AI will apply the requested edits, transformations, or enhancements to that image.
Parameters:
- prompt: (required) The text prompt describing what to generate or how to edit the image
- path: (required) The file path where the generated/edited image should be saved (relative to the current workspace directory ${args.cwd}). The tool will automatically add the appropriate image extension if not provided.
- image: (optional) The file path to an input image to edit or transform (relative to the current workspace directory ${args.cwd}). Supported formats: PNG, JPG, JPEG, GIF, WEBP.
Usage:
<function_calls>
<invoke name="generate_image">
<parameter name="prompt">Your image description here</parameter>
<parameter name="path">path/to/save/image.png</parameter>
<parameter name="image">path/to/input/image.jpg</parameter>
</invoke>
</function_calls>

Example: Requesting to generate a sunset image
<function_calls>
<invoke name="generate_image">
<parameter name="prompt">A beautiful sunset over mountains with vibrant orange and purple colors</parameter>
<parameter name="path">images/sunset.png</parameter>
</invoke>
</function_calls>

Example: Editing an existing image
<function_calls>
<invoke name="generate_image">
<parameter name="prompt">Transform this image into a watercolor painting style</parameter>
<parameter name="path">images/watercolor-output.png</parameter>
<parameter name="image">images/original-photo.jpg</parameter>
</invoke>
</function_calls>

Example: Upscaling and enhancing an image
<function_calls>
<invoke name="generate_image">
<parameter name="prompt">Upscale this image to higher resolution, enhance details, improve clarity and sharpness while maintaining the original content and composition</parameter>
<parameter name="path">images/enhanced-photo.png</parameter>
<parameter name="image">images/low-res-photo.jpg</parameter>
</invoke>
</function_calls>`
}
