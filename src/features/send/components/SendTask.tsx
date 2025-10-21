import './style.css'
import '@mantine/core/styles.css'

import {
  Button,
  Flex,
  MantineProvider,
  MultiSelect,
  Pill,
  Select,
  Space,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useCallback } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { THEME } from '../../../constants'
import { sendTask } from '..'

interface SendTaskProps {
  content: string
  projects: string[]
  labels: string[]
  uuid: string
  pageName?: string
}

export interface FormInput {
  task: string
  project: string
  label: string[]
  priority: string
  due: string
  uuid: string
  includePageLink: boolean
}

export const SendTask = ({
  content,
  projects,
  labels,
  uuid,
  pageName,
}: SendTaskProps) => {
  const settings = (logseq.settings ?? {}) as Record<string, unknown>
  const defaultProject = (settings.sendDefaultProject as string) ?? '--- ---'
  const defaultLabel = (settings.sendDefaultLabel as string) ?? '--- ---'
  const defaultLabels = defaultLabel !== '--- ---' ? [defaultLabel] : []
  const includePageLinkDefault = Boolean(settings.sendIncludePageLink)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput>({
    defaultValues: {
      task: content.trim(),
      project: projects.includes(defaultProject) ? defaultProject : '--- ---',
      label: defaultLabels,
      priority: '1',
      uuid: uuid,
      due: '',
      includePageLink: includePageLinkDefault,
    },
  })

  const submitTask = useCallback(
    (data: FormInput) => {
      sendTask(data, { pageName })
      logseq.UI.showMsg('Task sent to Todoist', 'success', { timeout: 3000 })
      reset()
      logseq.hideMainUI()
    },
    [uuid, pageName],
  )

  return (
    <MantineProvider theme={THEME}>
      <Flex bg="none" justify="right" p="md">
        <Flex
          p="md"
          mt="xl"
          bg="white"
          w="20rem"
          direction="column"
          id="send-task-container"
        >
          <Title fz="md">Todoist: Send Task</Title>
          <Pill size="xl" color="darkteal" my="0.5rem">
            {content}
          </Pill>
          {pageName && (
            <Text size="sm" c="dimmed">
              Current page: {pageName}
            </Text>
          )}
          <Space h="1rem" />
          <form onSubmit={handleSubmit(submitTask)}>
            <Stack gap="1rem">
              <Controller
                control={control}
                name="project"
                rules={{ required: 'Please select a project' }}
                render={({ field }) => (
                  <Select
                    {...field}
                    label="Project"
                    placeholder="Select Project"
                    data={projects}
                    error={errors?.project?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="label"
                render={({ field }) => (
                  <MultiSelect
                    {...field}
                    label="Label"
                    placeholder="Select Label"
                    data={labels}
                  />
                )}
              />
              <Controller
                control={control}
                name="includePageLink"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    label="Include current page name"
                    onChange={(event) => field.onChange(event.currentTarget.checked)}
                  />
                )}
              />
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select
                    {...field}
                    label="Priority (1: normal, 4: urgent)"
                    placeholder="Select Priority"
                    data={['1', '2', '3', '4']}
                  />
                )}
              />
              <Controller
                control={control}
                name="due"
                render={({ field }) => (
                  <TextInput
                    {...field}
                    label="Deadline"
                    placeholder="Enter deadline (e.g. Next Monday)"
                  />
                )}
              />
            </Stack>
            <Space h="1rem" />
            <Button type="submit" size="xs">
              Send Task
            </Button>
          </form>
        </Flex>
      </Flex>
    </MantineProvider>
  )
}
