<template lang="pug">
.input-radio-group
  label.input-radio(v-for="option in options")
    input(
      type="radio",
      :name.once="name",
      :required.once="required",
      :value="option.value",
      :checked="option.value === value"
      @change="update($event.target.value)"
    )
    span {{ option.label }}
</template>

<script lang="ts">
import { Component, Model, Prop, Vue } from 'nuxt-property-decorator';

@Component
export default class InputRadioGroup extends Vue {
  @Model('change')
  value!: string

  @Prop({ required: true })
  name!: string
  @Prop({ required: true })
  options!: { label: string, value: string }[]
  @Prop({ default: false })
  required!: boolean

  value_validate: string = this.value || '';

  update(value) {
    this.value_validate = value;
    this.$emit('change', value);
  }
}
</script>

<style lang="sass" scoped>
.input-radio-group
  display: flex
  flex-wrap: wrap
  justify-content: flex-start
  align-items: center
  margin-right: -15px

  .input-radio
    position: relative
    margin: 0 15px 15px 0
    cursor: pointer
    min-width: 150px

    &:hover
      background-color: darken($background-gray, 6%)

    span
      display: block
      padding: 10px 15px
      border: 1px solid $form-border-color
      border-radius: $border-radius
      color: $sch-gray
      background-color: $white
      text-align: center
      transition: background-color 100ms linear, border-color 100ms linear, color 100ms linear

      &:hover
        background-color: darken($background-gray, 6%)

    input
      appearance: none
      outline: 0
      position: absolute
      opacity: 0

+form-colors
  $bg: dyn-temp('bg')
  $fg: dyn-temp('fg')
  .input-radio
    input:checked + span
      background-color: $bg
      border-color: $bg
      color: $fg

    input:checked + span:hover
      background-color: darken($bg, 10%)
      border-color: darken($bg, 10%)
</style>
