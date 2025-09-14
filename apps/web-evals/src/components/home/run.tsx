import { useCallback, useState, useRef, useEffect } from "react"
import Link from "next/link"
import { Ellipsis, ClipboardList, Copy, Check, LoaderCircle, Trash, X, Clock, Play, CheckCircle } from "lucide-react"

import type { Run as EvalsRun, TaskMetrics as EvalsTaskMetrics } from "@roo-code/evals"

import { deleteRun, cancelQueuedRun, getRunQueueStatus } from "@/actions/runs"
import { getHeartbeat } from "@/actions/heartbeat"
import { formatCurrency, formatDuration, formatTokens, formatToolUsageSuccessRate } from "@/lib/formatters"
import { useCopyRun } from "@/hooks/use-copy-run"
import {
	Button,
	TableCell,
	TableRow,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Badge,
} from "@/components/ui"

type RunProps = {
	run: EvalsRun
	taskMetrics: EvalsTaskMetrics | null
}

type RunStatus = {
	status: "running" | "queued" | "completed" | "unknown"
	position: number | null
}

export function Run({ run, taskMetrics }: RunProps) {
	const [deleteRunId, setDeleteRunId] = useState<number>()
	const [runStatus, setRunStatus] = useState<RunStatus>({ status: "unknown", position: null })
	const [isLoadingStatus, setIsLoadingStatus] = useState(true)
	const [isCancelling, setIsCancelling] = useState(false)
	const continueRef = useRef<HTMLButtonElement>(null)
	const { isPending, copyRun, copied } = useCopyRun(run.id)

	// Fetch run status on mount and periodically
	useEffect(() => {
		const fetchStatus = async () => {
			try {
				// First check if run is completed
				if (run.taskMetricsId) {
					setRunStatus({ status: "completed", position: null })
					setIsLoadingStatus(false)
					return
				}

				// Check heartbeat for running status
				const heartbeat = await getHeartbeat(run.id)
				if (heartbeat) {
					setRunStatus({ status: "running", position: null })
					setIsLoadingStatus(false)
					return
				}

				// Get queue status
				const status = await getRunQueueStatus(run.id)
				setRunStatus(status)
			} catch (error) {
				console.error("Error fetching run status:", error)
			} finally {
				setIsLoadingStatus(false)
			}
		}

		fetchStatus()
		// Refresh status every 5 seconds for non-completed runs
		const interval = !run.taskMetricsId ? setInterval(fetchStatus, 5000) : null

		return () => {
			if (interval) clearInterval(interval)
		}
	}, [run.id, run.taskMetricsId])

	const onConfirmDelete = useCallback(async () => {
		if (!deleteRunId) {
			return
		}

		try {
			await deleteRun(deleteRunId)
			setDeleteRunId(undefined)
		} catch (error) {
			console.error(error)
		}
	}, [deleteRunId])

	const handleCancelQueued = useCallback(async () => {
		setIsCancelling(true)
		try {
			const cancelled = await cancelQueuedRun(run.id)
			if (cancelled) {
				// Refresh the page to update the list
				window.location.reload()
			}
		} catch (error) {
			console.error("Error cancelling queued run:", error)
		} finally {
			setIsCancelling(false)
		}
	}, [run.id])

	const getStatusBadge = () => {
		if (isLoadingStatus) {
			return <Badge variant="secondary">Loading...</Badge>
		}

		switch (runStatus.status) {
			case "running":
				return (
					<Badge variant="default" className="bg-green-600">
						<Play className="size-3 mr-1" />
						Running
					</Badge>
				)
			case "queued":
				return (
					<Badge variant="secondary">
						<Clock className="size-3 mr-1" />
						Queued #{runStatus.position}
					</Badge>
				)
			case "completed":
				return (
					<Badge variant="outline">
						<CheckCircle className="size-3 mr-1" />
						Completed
					</Badge>
				)
			default:
				return <Badge variant="outline">Unknown</Badge>
		}
	}

	return (
		<>
			<TableRow>
				<TableCell>{getStatusBadge()}</TableCell>
				<TableCell>{run.model}</TableCell>
				<TableCell>{run.passed}</TableCell>
				<TableCell>{run.failed}</TableCell>
				<TableCell>
					{run.passed + run.failed > 0 && (
						<span>{((run.passed / (run.passed + run.failed)) * 100).toFixed(1)}%</span>
					)}
				</TableCell>
				<TableCell>
					{taskMetrics && (
						<div className="flex items-center gap-1.5">
							<div>{formatTokens(taskMetrics.tokensIn)}</div>/
							<div>{formatTokens(taskMetrics.tokensOut)}</div>
						</div>
					)}
				</TableCell>
				<TableCell>
					{taskMetrics?.toolUsage?.apply_diff && (
						<div className="flex flex-row items-center gap-1.5">
							<div>{taskMetrics.toolUsage.apply_diff.attempts}</div>
							<div>/</div>
							<div>{formatToolUsageSuccessRate(taskMetrics.toolUsage.apply_diff)}</div>
						</div>
					)}
				</TableCell>
				<TableCell>{taskMetrics && formatCurrency(taskMetrics.cost)}</TableCell>
				<TableCell>{taskMetrics && formatDuration(taskMetrics.duration)}</TableCell>
				<TableCell>
					<div className="flex items-center gap-2">
						{runStatus.status === "queued" && (
							<Button
								variant="ghost"
								size="icon"
								onClick={handleCancelQueued}
								disabled={isCancelling}
								title="Cancel queued run">
								{isCancelling ? (
									<LoaderCircle className="animate-spin size-4" />
								) : (
									<X className="size-4" />
								)}
							</Button>
						)}
						<DropdownMenu>
							<Button variant="ghost" size="icon" asChild>
								<DropdownMenuTrigger>
									<Ellipsis />
								</DropdownMenuTrigger>
							</Button>
							<DropdownMenuContent align="end">
								<DropdownMenuItem asChild>
									<Link href={`/runs/${run.id}`}>
										<div className="flex items-center gap-1">
											<ClipboardList />
											<div>View Tasks</div>
										</div>
									</Link>
								</DropdownMenuItem>
								{run.taskMetricsId && (
									<DropdownMenuItem onClick={() => copyRun()} disabled={isPending || copied}>
										<div className="flex items-center gap-1">
											{isPending ? (
												<>
													<LoaderCircle className="animate-spin" />
													Copying...
												</>
											) : copied ? (
												<>
													<Check />
													Copied!
												</>
											) : (
												<>
													<Copy />
													Copy to Production
												</>
											)}
										</div>
									</DropdownMenuItem>
								)}
								<DropdownMenuItem
									onClick={() => {
										setDeleteRunId(run.id)
										setTimeout(() => continueRef.current?.focus(), 0)
									}}>
									<div className="flex items-center gap-1">
										<Trash />
										<div>Delete</div>
									</div>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</TableCell>
			</TableRow>
			<AlertDialog open={!!deleteRunId} onOpenChange={() => setDeleteRunId(undefined)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction ref={continueRef} onClick={onConfirmDelete}>
							Continue
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
