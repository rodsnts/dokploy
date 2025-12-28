import { zodResolver } from "@hookform/resolvers/zod";
import { FileIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DopplerIntegration } from "@/components/dashboard/application/environment/doppler-integration";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";

const updateProjectSchema = z.object({
	env: z.string().optional(),
});

type UpdateProject = z.infer<typeof updateProjectSchema>;

interface Props {
	projectId: string;
	children?: React.ReactNode;
}

export const ProjectEnvironment = ({ projectId, children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.project.update.useMutation();
	const { mutateAsync: updateDoppler, isLoading: isUpdatingDoppler } =
		api.project.update.useMutation();
	const { data, refetch } = api.project.one.useQuery(
		{
			projectId,
		},
		{
			enabled: !!projectId,
		},
	);

	const form = useForm<UpdateProject>({
		defaultValues: {
			env: data?.env ?? "",
		},
		resolver: zodResolver(updateProjectSchema),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				env: data.env ?? "",
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateProject) => {
		await mutateAsync({
			env: formData.env || "",
			projectId: projectId,
		})
			.then(() => {
				toast.success("Project env updated successfully");
				utils.project.all.invalidate();
			})
			.catch(() => {
				toast.error("Error updating the env");
			})
			.finally(() => {});
	};

	const handleSaveDoppler = async (dopplerData: {
		dopplerEnabled: boolean;
		dopplerServiceToken?: string;
		dopplerProject?: string;
		dopplerConfig?: string;
		dopplerMergeStrategy?: string;
	}) => {
		await updateDoppler({
			projectId,
			dopplerEnabled: dopplerData.dopplerEnabled,
			dopplerServiceToken: dopplerData.dopplerServiceToken || null,
			dopplerProject: dopplerData.dopplerProject || null,
			dopplerConfig: dopplerData.dopplerConfig || null,
			dopplerMergeStrategy: dopplerData.dopplerMergeStrategy as
				| "doppler_priority"
				| "manual_priority"
				| "doppler_only"
				| "manual_only"
				| undefined,
		});
		await refetch();
		await utils.project.one.invalidate({ projectId });
	};

	// Add keyboard shortcut for Ctrl+S/Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "s" && !isLoading && isOpen) {
				e.preventDefault();
				form.handleSubmit(onSubmit)();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [form, onSubmit, isLoading, isOpen]);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ?? (
					<DropdownMenuItem
						className="w-full cursor-pointer space-x-3"
						onSelect={(e) => e.preventDefault()}
					>
						<FileIcon className="size-4" />
						<span>Project Environment</span>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl">
				<DialogHeader>
					<DialogTitle>Project Environment</DialogTitle>
					<DialogDescription>
						Update the env Environment variables that are accessible to all
						services of this project.
					</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="manual" className="w-full">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="manual">Manual Variables</TabsTrigger>
						<TabsTrigger value="doppler">Doppler Integration</TabsTrigger>
					</TabsList>
					<TabsContent value="manual" className="space-y-4">
						{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
						<AlertBlock type="info">
							Use this syntax to reference project-level variables in your
							service environments:{" "}
							<code>DATABASE_URL=${"{{project.DATABASE_URL}}"}</code>
						</AlertBlock>
						<div className="grid gap-4">
							<div className="grid items-center gap-4">
								<Form {...form}>
									<form
										onSubmit={form.handleSubmit(onSubmit)}
										className="grid w-full gap-4 "
									>
										<FormField
											control={form.control}
											name="env"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Environment variables</FormLabel>
													<FormControl>
														<CodeEditor
															lineWrapping
															language="properties"
															wrapperClassName="h-[35rem] font-mono"
															placeholder={`NODE_ENV=production
PORT=3000

                                                    `}
															{...field}
														/>
													</FormControl>

													<pre>
														<FormMessage />
													</pre>
												</FormItem>
											)}
										/>
										<DialogFooter>
											<Button isLoading={isLoading} type="submit">
												Update
											</Button>
										</DialogFooter>
									</form>
								</Form>
							</div>
						</div>
					</TabsContent>
					<TabsContent value="doppler">
						<DopplerIntegration
							data={data}
							onSave={handleSaveDoppler}
							isLoading={isUpdatingDoppler}
						/>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
