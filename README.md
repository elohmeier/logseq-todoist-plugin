[:gift_heart: Sponsor this project on Github](https://github.com/sponsors/hkgnp) or [:coffee: Get me a coffee](https://www.buymeacoffee.com/hkgnp.dev) if you like this plugin!

# Overview

This simple plugin has 2 primary features:

## Retrieving tasks from Todoist.

You can retrieve tasks in 3 ways:

- Retrieving tasks from a default project (indicated in plugin settings);
- Retrieving today's tasks, regardless of the project; and
- Retrieving tasks based on a custom filter. Key in the desired filter in any block, and type `/Todoist: Retrieve Custom Filter`

## Sending tasks to Todoist

You can send tasks in 2 ways:

- If you set a default project to send tasks to, just trigger `/Todoist: Send Task` on the block containing the task.
- If no default project is indicated, there will be a popup to specify the necessary parameters.
- You can also choose `/Todoist: Send Task (manual)` to trigger the popup.

### Mapping Logseq tags to Todoist projects & labels

You can annotate a block with Logseq tags to drive Todoist project and label assignments. Configure each tag page with Todoist metadata and the plugin will apply it whenever that tag appears on a task block.

1. Create or open the tag page (e.g. `project-bar` for `#project-bar`).
2. Add the Todoist project ID as a property on the page or a child block:
   ```
   todoist-project-id:: 123456789
   ```
3. For labels, add the label names (comma separated when multiple):
   ```
   todoist-label:: urgent, waiting
   ```

When a block such as `TODO Draft update #project-bar #waiting` is sent or updated, the plugin:

- overrides the Todoist project with `123456789` (unless you explicitly pick a different project in the send dialog);
- applies the Todoist labels `urgent` and `waiting`;
- mirrors the same tags back into Logseq when tasks are retrieved from Todoist.

If multiple project tags are present on the same block or a tag is missing its Todoist metadata, the plugin shows a warning and skips the conflicting assignment. Update the tag page to resolve the warning.

## Preferences

The plugin settings page contains other preferences to customise how you want tasks to be retrieved or sent to Todoist.

# Hiding block properties

The plugin automatically creates the following block properties: `todoistid`, `comments`, `atttachments`. If you wish to hide them, you can find the below flag in `config.edn` and make the changes:

```
;; hide specific properties for blocks
;; E.g. :block-hidden-properties #{:created-at :updated-at}
:block-hidden-properties #{:todoistid :comments :attachments}
```

# Installation

1. Go to https://developer.todoist.com/appconsole.html and create an App. You will need to create an App (give it any name you like), and you will be able to obtain a **test token**. Note down the test token as this is the API Token that you will need in Step 3.

2. Head on to the Marketplace and install the logseq-todoist-plugin.

3. After it is installed, click on the plugin icon and indicate your preferences in the settings. Key in your API token that you obtained in Step 1 as well.

![](/screenshots/enter-variables2.png)
