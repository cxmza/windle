package gmgn

import (
	"encoding/json"
	"strconv"
)

type flexInt64 int64

func (i *flexInt64) UnmarshalJSON(data []byte) error {
	var number int64
	if err := json.Unmarshal(data, &number); err == nil {
		*i = flexInt64(number)
		return nil
	}
	var asFloat float64
	if err := json.Unmarshal(data, &asFloat); err == nil {
		*i = flexInt64(int64(asFloat))
		return nil
	}
	var text string
	if err := json.Unmarshal(data, &text); err == nil && text != "" {
		if parsed, err := strconv.ParseInt(text, 10, 64); err == nil {
			*i = flexInt64(parsed)
			return nil
		}
		if parsed, err := strconv.ParseFloat(text, 64); err == nil {
			*i = flexInt64(int64(parsed))
			return nil
		}
	}
	*i = 0
	return nil
}

type flexString string

func (s *flexString) UnmarshalJSON(data []byte) error {
	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		*s = flexString(text)
		return nil
	}
	var number json.Number
	if err := json.Unmarshal(data, &number); err == nil {
		*s = flexString(number.String())
		return nil
	}
	*s = ""
	return nil
}

type flexList[T any] []T

func (l *flexList[T]) UnmarshalJSON(data []byte) error {
	var items []json.RawMessage
	if err := json.Unmarshal(data, &items); err != nil {
		*l = nil
		return nil
	}
	out := make([]T, 0, len(items))
	for _, raw := range items {
		var item T
		if err := json.Unmarshal(raw, &item); err != nil {
			continue
		}
		out = append(out, item)
	}
	*l = out
	return nil
}
