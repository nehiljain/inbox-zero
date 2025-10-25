"use client";

import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/components/Toast";
import { createOrganizationAction } from "@/utils/actions/organization";
import {
  createOrganizationBody,
  type CreateOrganizationBody,
} from "@/utils/actions/organization.validation";
import { slugify } from "@/utils/string";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function CreateOrganizationPage() {
  const router = useRouter();
  const { isLoading, mutate, error } = useUser();
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields },
    watch,
    setValue,
  } = useForm<CreateOrganizationBody>({
    resolver: zodResolver(createOrganizationBody),
  });

  const nameValue = watch("name");
  const userModifiedSlug = dirtyFields.slug;

  useEffect(() => {
    if (nameValue && !userModifiedSlug) {
      const generatedSlug = slugify(nameValue);
      setValue("slug", generatedSlug);
    }
  }, [nameValue, userModifiedSlug, setValue]);

  const onSubmit: SubmitHandler<CreateOrganizationBody> = useCallback(
    async (data) => {
      const result = await createOrganizationAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error creating organization",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Organization created successfully!" });
        mutate();
        router.push(`/organization/${result?.data?.id}`);
      }
    },
    [mutate, router, emailAccountId],
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error as { error?: string; info?: { error: string } } | undefined}
    >
      <div className="container mx-auto py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Create Organization</h1>
            <p className="text-muted-foreground">
              Set up your organization to collaborate with your team and manage
              shared resources.
            </p>
          </div>

          <form
            className="max-w-sm space-y-4"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Input
              type="text"
              name="name"
              label="Organization Name"
              placeholder="Apple Inc."
              registerProps={register("name")}
              error={errors.name}
            />

            <Input
              type="text"
              name="slug"
              label="URL Slug"
              placeholder="apple-inc"
              registerProps={register("slug")}
              error={errors.slug}
            />

            <div className="flex gap-4 pt-4">
              <Button type="submit" loading={isSubmitting}>
                Create Organization
              </Button>
            </div>
          </form>
        </div>
      </div>
    </LoadingContent>
  );
}
