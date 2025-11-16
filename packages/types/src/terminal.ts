import { z } from "zod"

/**
 * CommandExecutionStatus
 */

export const commandExecutionStatusSchema = z.discriminatedUnion("status", [
	z.object({
		executionId: z.string(),
		status: z.literal("started"),
		pid: z.number().optional(),
		command: z.string(),
		isService: z.boolean().optional(),
		servicePort: z.number().optional(),
	}),
	z.object({
		executionId: z.string(),
		status: z.literal("output"),
		output: z.string(),
	}),
	z.object({
		executionId: z.string(),
		status: z.literal("exited"),
		exitCode: z.number().optional(),
	}),
	z.object({
		executionId: z.string(),
		status: z.literal("fallback"),
	}),
	z.object({
		executionId: z.string(),
		status: z.literal("timeout"),
	}),
	z.object({
		executionId: z.string(),
		status: z.literal("service_ready"),
		serviceUrl: z.string().optional(),
		servicePort: z.number().optional(),
	}),
	z.object({
		executionId: z.string(),
		status: z.literal("service_starting"),
		message: z.string().optional(),
	}),
	z.object({
		executionId: z.string(),
		status: z.literal("service_stopping"),
	}),
])

export type CommandExecutionStatus = z.infer<typeof commandExecutionStatusSchema>

/**
 * Service Status
 */
export const serviceStatusSchema = z.enum(["starting", "ready", "running", "stopping", "stopped", "error"])

export type ServiceStatus = z.infer<typeof serviceStatusSchema>

/**
 * Service Information
 */
export const serviceInfoSchema = z.object({
	id: z.string(),
	name: z.string(),
	command: z.string(),
	pid: z.number().optional(),
	port: z.number().optional(),
	url: z.string().optional(),
	status: serviceStatusSchema,
	startedAt: z.number(),
	readyAt: z.number().optional(),
	stoppedAt: z.number().optional(),
	cwd: z.string(),
	taskId: z.string().optional(),
})

export type ServiceInfo = z.infer<typeof serviceInfoSchema>
