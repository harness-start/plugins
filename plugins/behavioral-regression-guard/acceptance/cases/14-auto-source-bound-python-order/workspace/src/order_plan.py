import warnings


class OrderConflictWarning(RuntimeWarning):
    pass


class OrderPlan:
    def __init__(self, sequence=()):
        self._sequences = [list(sequence)]

    def plus(self, other):
        combined = OrderPlan()
        combined._sequences = self._sequences + other._sequences
        return combined

    @property
    def resolved(self):
        result = self._sequences[0] if self._sequences else []
        for sequence in self._sequences[1:]:
            result = self.merge(result, sequence)
        return result

    @staticmethod
    def merge(left, right):
        combined = list(left)
        last_index = len(left)
        for item in reversed(right):
            try:
                index = combined.index(item)
            except ValueError:
                combined.insert(last_index, item)
            else:
                if index > last_index:
                    warnings.warn(
                        "Detected conflicting source sequences:\n{}\n{}".format(left, right),
                        OrderConflictWarning,
                    )
                last_index = index
        return combined
