[
  to_entries[]
  | select(
      .value.type == "response_item"
      and .value.payload.type == "function_call"
      and (.value.payload.name == "spawn_agent" or .value.payload.name == "wait_agent")
    )
  | {
      index: .key,
      name: .value.payload.name,
      call_id: .value.payload.call_id,
      arguments: (.value.payload.arguments | fromjson?)
    }
] as $calls
| [$calls[] | select(.name == "spawn_agent")] as $spawns
| [$calls[] | select(.name == "wait_agent")] as $waits
| ($waits[0] // {}) as $wait
| [
    to_entries[]
    | select(.value.type == "response_item" and .value.payload.type == "function_call_output")
    | {index: .key, call_id: .value.payload.call_id, output: .value.payload.output}
    | select(.call_id == $wait.call_id)
  ] as $receipts
| ($receipts[0].output | fromjson?) as $receipt
| ($spawns | length) == 2
  and ($waits | length) == 1
  and ($receipts | length) == 1
  and ($wait.arguments.timeout_ms == 10000)
  and ($wait.index > ($spawns | map(.index) | max))
  and ($receipts[0].index > $wait.index)
  and (($receipt | type) == "object")
  and (($receipt.timed_out | type) == "boolean")
  and (
    ($receipt.timed_out == true and $receipt.message == "Wait timed out.")
    or ($receipt.timed_out == false and $receipt.message == "Wait completed.")
  )
