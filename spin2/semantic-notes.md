# Semantic parsing of Spin2

Accumulation of notes as I'm determing how this should work

## Comments

There are four forms of comments.

**Sample Code:**

```spin
' comment - single line
'' doc comment - single line

{
comment block
}

{{
    doc comment block
}}
```

## Strings

**Sample Code:**

```spin
 "string"
```

### Regarding methods or functions

We're using methods since spin objects are just that, objects. So, PUB and PRI declared routines are `methods`, while we use `functions` as the built-in routines of the spin/spin2 language.   We base this on:

---

**Function**: A Function is a reusable piece of code. It can have input data on which it can operate (i.e. arguments) and it can also return data by having a return type. It is the concept of procedural and functional programming languages.

**Method**: The working of the method is similar to a function i.e. it also can have input parameters/arguments and can also return data by having a return type but has two important differences when compared to a function.

1. A method is associated or related to the instance of the object it is called using.
2. A method is limited to operating on data inside the class in which the method is contained.
3. It is a concept of object-oriented programming language.

---

Now let's look at the contribution from each code block:

## SECTION: CON

This section contains global constant declarations.

Returns from this section: `variable.readonly.definition`, `operator`, `number`, `variable.readonly`, 

## SECTION: VAR

This section contains global variable declarations.
This is also instance-data, instance variables: `property.declaration`, `type`.

## SECTION: DAT

This section contains data declarations as possibly pasm code.
This is also class-data, class variables: `property.declaration.static`, `type`.

## SECTION: PUB

This section declares a class-public method: `method.declaration`.

There are optional passed parameters, return values and local variables: `parameter.declaration.readonly`, `parameter.declaration.local.return`, and `variable.declaration.local`

## SECTION: PRI

This section declares a class-private method: `method.declaration.static`.

There are optional passed parameters, return values and local variables: `parameter.declaration.readonly`, `parameter.declaration.local.return`, and `variable.declaration.local`

## SECTION: OBJ

This section effectively imports other classes and names their instances.
Instances can be an array of class instances.

Returns from this section: `variable.namespace.declaration`, `operator`, `number`, and `meta.object.filename`

## Examples

This is a collection of notable examples with each predicting what will be emitted by the syntax and semantic parsers.

### Example: Section Names (CON, DAT, OBJ, VAR)

**Sample Code:**

```spin
CON { Timing }
```

... returns:

- `keyword.block.con` | `meta.block.con.language.spin`
- `comment.block` 

### Example: Comments

**Sample Code:**

```spin
' header comment
```

... returns:

- `comment.line` 

**Sample Code:**

```spin
'' header doc comment
```

... returns:

- `comment.line.documentation`

**Sample Code:**

```spin
{
     block comment
}
```

... returns:

- `comment.block`

**Sample Code:**

```spin
{{
    block doc comments
}}
```

... returns:

- `comment.block.documentation` 

### Example: CON

This section defines constants. They can be defined literally.

**Sample Code:**

```spin
    DIGIT_NOVALUE = -2   ' digit value when NOT [0-9]
```

... returns:

| text                   | semantic type                            | syntax (textmate) type        |
| --- | --- |--- |
| DIGIT_NOVALUE          | `variable.readonly.declaration` |  |
| =                      | `operator`                      |  |
| -2                     |                         | constant.numeric.base10 |
| ' digit value when ... | `comment`                       |  `comment.line` |

They can be defined based on earlier constants in the section.

**Sample Code:**

```spin
    FIVE_K = FIVE_THOUSAND   ' alias this constant
```

... returns:

| text             | semantic type                            | syntax (textmate) type      |
| --- | --- |--- |
| FIVE_K           | `variable.readonly.declaration` |  |
| =                | `operator`                      | |
| FIVE_THOUSAND    | `variable.readonly`             |  |
| ' alias this ... | `comment`                       |  `comment.line` |

They can be defined based on constants in other objects, too!

**Sample Code:**

```spin
    DIGIT_NOVALUE = user.DIGIT_NOVALUE   ' expose constant defined in our 'user' object
```

... returns:

| text               | semantic type                            | syntax (textmate) type        |
| --- | --- |--- |
| DIGIT_NOVALUE      | `variable.readonly.declaration` |   |
| =                  | `operator`                      |  |
| user               | `namespace.module` |
| .                  | `operator`                      |   |
| DIGIT_NOVALUE      | `variable.readonly`             |   |
| ' expose consta... | `comment`                       |  `comment.line` |

They can be defined enumerations:

**Sample Code:**

```spin 
#0, ST_UNKNOWN, ST_FORWARD, ST_REVERSE      ' param values
```

... returns:

| text               | semantic type                            | syntax (textmate) type        |
| --- | --- |--- |
| #     |  |   |
| 0     |  |  `constant.numeric.base10.spin` |
| ,                  | `operator`                      |  |
| ST_UNKNOWN               | `enumMember.declaration.readonly` |
| ,                  | `operator`                      |   |
| ST_FORWARD      | `enumMember.declaration.readonly`             |   |
| ,                  | `operator`                      |   |
| ST_REVERSE      | `enumMember.declaration.readonly`             |   |
| ' param values | `comment`                       |  `comment.line`  |

### Example: PUB, PRI

Typical "this is not an object" first public method in a file.

**Sample Code:**

```spin
PUB null()
```

... returns:

| text | semantic type                 | syntax (textmate) type          |
| --- | --- |--- |
| PUB  | `keyword`            | `keyword.block.pub.spin` |
| null | `method.declaration` |   |
| \(   | `operator`           | |
| \)   | `operator`           | |

Typical private method with a single return value and local variables:

**Sample Code:**

```spin
PRI validateBmpFile(pBmpFileImage) : bValidStatus, lengthInBytes | pFileHeader, i, iStart, iEnd, pLastByte  ' notes
```

... returns:

| text            | semantic type                                 | syntax (textmate) type         |
| --- | --- |--- |
| PRI             | `keyword`                            |  `keyword.block.pri.spin`  |
| validateBmpFile | `method.declaration.static`          |  |
| \(              | `operator`                           |   |
| pBmpFileImage   | `parameter.declaration.readonly`     |  |
| \)              | `operator`                           |   |
| :               | `operator`                           |  |
| bValidStatus    | `parameter.declaration.local.return` |  |
| ,               | `operator`                           |   |
| lengthInBytes   | `parameter.declaration.local.return` |   |
| \|              | `operator`                           |   |
| pFileHeader     | `variable.declaration.local`         |   |
| ,               | `operator`                           |   |
| i               | `variable.declaration.local`         |   |
| ,               | `operator`                           |   |
| iStart          | `variable.declaration.local`         | |
| ,               | `operator`                           |  |
| iEnd            | `variable.declaration.local`         |   |
| ,               | `operator`                           |  |
| pLastByte       | `variable.declaration.local`         |  |
| ' notes         | `comment`                            | |

### Example: OBJ

This section imports objects to be used.

**Sample Code:**

```spin
    pixels              : "isp_hub75_screenUtils"
```

... returns:

| text                    | semantic type       | syntax (textmate) type        |
| --- | --- |--- |
| pixels                  | `namespace.declaration` |  |
| :                       | `operator` |   |
| "isp\_hub75_screenUtils" | `meta.object.filename`   |   |

**NOTE** Should `class` really be `namespace` ???

**Sample Code:**

```spin
    digit[MAX_DIGITS]   : "isp_hub75_7seg"
```

... returns:

| text                    | semantic type                | syntax (textmate) type        |
| --- | --- |--- |
| digit                   | `namespace.declaration` | `entity.name.object.language.spin`|
| [                       | `operator`          |  |
| MAX_DIGITS              | `variable.readonly` |  |
| ]                       | `operator`          |  |
| :                       | `operator`          |   |
| "isp_hub75_screenUtils" |             | `meta.object.filename.spin` |

**NOTE** Should `class` really be `namespace` ???
